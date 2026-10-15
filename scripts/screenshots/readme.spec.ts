import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

// Screenshots for the README. Provider responses are mocked (no keys); everything else is the real app.
const ROOT = path.join(__dirname, "..", "..");
const OUT = (name: string) => path.join(ROOT, "docs", "screenshots", name);
const FIXTURES = path.join(ROOT, "e2e", "fixtures");
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };

const sse = (text: string, usage = { prompt_tokens: 412, completion_tokens: 38 }) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`;

async function boot(page: Page, keys: Record<string, string>) {
    await page.goto("/");
    await expect(page.getByText("Initializing PrivAI...")).toHaveCount(0);
    await page.evaluate(async keys => {
        const db: IDBDatabase = await new Promise(r => { const q = indexedDB.open("privai-db"); q.onsuccess = () => r(q.result); });
        const tx = db.transaction("settings", "readwrite");
        tx.objectStore("settings").put(keys, "apiKeys");
        await new Promise(r => { tx.oncomplete = r; });
        db.close();
    }, keys);
    await page.reload();
    await expect(page.getByText("Initializing PrivAI...")).toHaveCount(0);
}

test("chat with attachments", async ({ page }) => {
    await page.route("https://api.groq.com/openai/v1/chat/completions", r =>
        r.request().method() === "OPTIONS"
            ? r.fulfill({ status: 204, headers: CORS })
            : r.fulfill({ headers: { ...CORS, "content-type": "text/event-stream" }, body: sse("The quarterly retainer is **4,750 euros**, payable on the first business day of each quarter. Either side can end the agreement with sixty days' written notice.") }));
    await boot(page, { groq: "k" });
    await page.getByRole("button", { name: "Start New Chat" }).click();
    await page.locator('input[type="file"]').setInputFiles([path.join(FIXTURES, "contract.pdf"), path.join(FIXTURES, "photo.png")]);
    const box = page.getByPlaceholder(/Message PrivAI/);
    await box.fill("What is the retainer, and how can either side terminate?");
    await box.press("Enter");
    await expect(page.getByText("4,750 euros")).toBeVisible();
    await page.getByText(/excerpt.*from your files/).click();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: OUT("chat-attachments.png") });
});

test("arena", async ({ page }) => {
    await page.route("https://api.groq.com/openai/v1/chat/completions", r =>
        r.request().method() === "OPTIONS"
            ? r.fulfill({ status: 204, headers: CORS })
            : r.fulfill({ headers: { ...CORS, "content-type": "text/event-stream" }, body: sse("A debounce delays a call until input has been quiet for a set time, so a burst of keystrokes triggers one search instead of twenty.", { prompt_tokens: 24, completion_tokens: 31 }) }));
    await page.route("https://api.anthropic.com/v1/messages", r =>
        r.request().method() === "OPTIONS"
            ? r.fulfill({ status: 204, headers: CORS })
            : r.fulfill({
                headers: { ...CORS, "content-type": "text/event-stream" },
                body:
                    `event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":24,"output_tokens":1}}}\n\n` +
                    `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Debouncing waits for a pause before running a function. Typing in a search box fires one request after you stop, rather than one per keystroke." } })}\n\n` +
                    `event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":29}}\n\n` +
                    `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
            }));
    await boot(page, { groq: "k", anthropic: "k" });
    await page.getByRole("button", { name: "Start New Chat" }).click();
    await page.getByRole("button", { name: /Battle Arena/ }).click();
    await page.locator("select").nth(0).selectOption("openai/gpt-oss-20b");
    await page.locator("select").nth(1).selectOption("claude-haiku-5-5");
    await page.getByPlaceholder(/Enter comparison prompt/).fill("Explain debouncing in two sentences.");
    await page.getByRole("button", { name: "Battle", exact: true }).click();
    await expect(page.getByText(/Debouncing waits/)).toBeVisible();
    await expect(page.getByText(/A debounce delays/)).toBeVisible();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: OUT("arena.png") });
});
