import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Feature tests for everything else the README describes. Same approach as privai.spec.ts:
 * real production build, provider endpoints mocked with page.route.
 */

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
type Body = { model: string; messages: { role: string; content: string }[] };

/** OpenAI-style SSE endpoint; `reply` may be a function of the request body. */
async function mockOpenAICompat(page: Page, url: string, reply: string | ((b: Body) => string), opts: { holdMs?: number } = {}) {
    const bodies: Body[] = [];
    await page.route(url, async (route: Route) => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
        const body = JSON.parse(route.request().postData() || "{}") as Body;
        bodies.push(body);
        if (opts.holdMs) await new Promise(r => setTimeout(r, opts.holdMs));
        const text = typeof reply === "function" ? reply(body) : reply;
        await route.fulfill({
            headers: { ...CORS, "content-type": "text/event-stream" },
            body: `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`,
        }).catch(() => undefined); // the page may have aborted the request
    });
    return bodies;
}

async function boot(page: Page, keys: Record<string, string>, sessions: unknown[] = []) {
    await page.goto("/");
    await expect(page.getByText("Initializing PrivAI...")).toHaveCount(0);
    await page.evaluate(async ({ keys, sessions }) => {
        const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("privai-db"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        const tx = db.transaction(["settings", "sessions"], "readwrite");
        tx.objectStore("settings").put(keys, "apiKeys");
        for (const s of sessions) tx.objectStore("sessions").put(s);
        await new Promise(r => { tx.oncomplete = r; });
        db.close();
    }, { keys, sessions });
    await page.reload();
    await expect(page.getByText("Initializing PrivAI...")).toHaveCount(0);
}

const input = (page: Page) => page.getByPlaceholder(/Message PrivAI/);
async function send(page: Page, text: string) {
    await input(page).fill(text);
    await input(page).press("Enter");
}
const GROQ = "https://api.groq.com/openai/v1/chat/completions";

test("Stop before the first token: shows a notice and the next request does not include it", async ({ page }) => {
    let call = 0;
    const bodies: Body[] = [];
    await page.route(GROQ, async route => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
        bodies.push(JSON.parse(route.request().postData() || "{}"));
        if (++call === 1) return; // never answer the first request; the user presses Stop
        await route.fulfill({ headers: { ...CORS, "content-type": "text/event-stream" }, body: `data: {"choices":[{"delta":{"content":"SECOND-OK"}}]}\n\ndata: [DONE]\n\n` });
    });
    await boot(page, { groq: "k" });
    await page.getByRole("button", { name: "Start New Chat" }).click();
    await send(page, "first");
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Stopped before the model replied.")).toBeVisible();

    await send(page, "second");
    await expect(page.getByText("SECOND-OK")).toBeVisible();
    expect(bodies[1].messages).toEqual([{ role: "user", content: "first\n\nsecond" }]);
});

test("Edit a sent prompt: new branch is sent, and earlier versions stay switchable", async ({ page }) => {
    const bodies = await mockOpenAICompat(page, GROQ, b => `reply to: ${b.messages.at(-1)!.content}`);
    await boot(page, { groq: "k" });
    await page.getByRole("button", { name: "Start New Chat" }).click();
    await send(page, "original question");
    await expect(page.getByText("reply to: original question")).toBeVisible();

    await page.getByTitle("Edit prompt and branch").click();
    await page.locator("textarea").first().fill("edited question");
    await page.getByRole("button", { name: /Save & Fork Branch/ }).click();
    await expect(page.getByText("reply to: edited question")).toBeVisible();
    expect(bodies[1].messages).toEqual([{ role: "user", content: "edited question" }]);

    await expect(page.getByText("2 / 2")).toBeVisible();
    await page.getByTitle("Previous branch").click();
    await expect(page.getByText("1 / 2")).toBeVisible();
    await expect(page.getByText("original question", { exact: true })).toBeVisible();
});

test("Arena streams two providers side by side with per-model cost", async ({ page }) => {
    await mockOpenAICompat(page, GROQ, "GROQ-SIDE");
    await page.route("https://api.anthropic.com/v1/messages", async route => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
        await route.fulfill({
            headers: { ...CORS, "content-type": "text/event-stream" },
            body:
                `event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12,"output_tokens":1}}}\n\n` +
                `event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"CLAUDE-SIDE"}}\n\n` +
                `event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":4}}\n\n` +
                `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
        });
    });
    await boot(page, { groq: "k", anthropic: "k" });
    await page.getByRole("button", { name: "Start New Chat" }).click();
    await page.getByRole("button", { name: /Battle Arena/ }).click();
    await page.locator("select").nth(0).selectOption("openai/gpt-oss-20b");
    await page.locator("select").nth(1).selectOption("claude-haiku-5-5");
    await page.getByPlaceholder(/Enter comparison prompt/).fill("say hi");
    await page.getByRole("button", { name: "Battle", exact: true }).click();
    await expect(page.getByText("GROQ-SIDE")).toBeVisible();
    await expect(page.getByText("CLAUDE-SIDE")).toBeVisible();
    // Anthropic reported 12 in / 4 out: $0.10*12/1M + $0.50*4/1M = $0.0000032 → shown as "<$0.0001"
    await expect(page.getByText("<$0.0001").first()).toBeVisible();
});

test("Command palette: find a chat by title, export it to Markdown", async ({ page }) => {
    const now = Date.now();
    const mk = (id: string, title: string, text: string) => ({
        id, title, createdAt: now, updatedAt: now, modelConfig: { provider: "groq", modelId: "openai/gpt-oss-20b" },
        messages: [{ id: id + "m", role: "user", content: text, timestamp: now }],
    });
    await boot(page, { groq: "k" }, [mk("a", "Alpha notes", "ALPHA-BODY"), mk("b", "Beta plans", "BETA-BODY")]);

    await page.keyboard.press("Control+k");
    const box = page.getByPlaceholder(/Type a command/);
    await box.fill("Beta plans");
    await box.press("Enter");
    await expect(page.getByText("BETA-BODY")).toBeVisible();

    await page.keyboard.press("Control+k");
    await box.fill("Export Chat to Markdown");
    const [download] = await Promise.all([page.waitForEvent("download"), box.press("Enter")]);
    expect(download.suggestedFilename()).toBe("beta-plans.md");
    const md = await (await download.createReadStream()).toArray();
    expect(Buffer.concat(md).toString()).toContain("BETA-BODY");
});

test("Code block: 'Open in Canvas' renders HTML in a sandboxed iframe without same-origin access", async ({ page }) => {
    await mockOpenAICompat(page, GROQ, "Here:\n\n```html\n<h1 id=\"t\">SANDBOX-OK</h1>\n```\n");
    await boot(page, { groq: "k" });
    await page.getByRole("button", { name: "Start New Chat" }).click();
    await send(page, "make html");
    await page.getByTitle("Open in Canvas Sandbox").click();
    const frame = page.locator("iframe");
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-modals");
    await expect(page.frameLocator("iframe").locator("#t")).toHaveText("SANDBOX-OK");
});

test("LM Studio: chat goes to localhost:1234 (OpenAI format) and is marked local and free", async ({ page }) => {
    const bodies = await mockOpenAICompat(page, "http://localhost:1234/v1/chat/completions", "LMSTUDIO-OK");
    await boot(page, {});
    await page.getByRole("button", { name: "Start New Chat" }).click();
    await page.getByRole("button", { name: /COMPUTE CORE|LOCAL RUNTIME/ }).click();
    await page.getByText("LM Studio (Active Model)").click();
    await expect(page.getByText("Runs on this device")).toBeVisible();
    await send(page, "hi lm studio");
    await expect(page.getByText("LMSTUDIO-OK")).toBeVisible();
    expect(bodies[0]).toMatchObject({ model: "local-model", stream: true, messages: [{ role: "user", content: "hi lm studio" }] });
    await expect(page.getByText("On this device", { exact: true })).toBeVisible(); // reply badge
});
