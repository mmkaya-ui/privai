import { test, expect, type Page, type Route } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

/**
 * Every test here checks something the README / UI claims, against the real production build.
 * Cloud calls go to a mocked Groq endpoint (the app's default provider), so we can inspect
 * exactly what would leave the browser.
 */

const FIXTURES = path.join(__dirname, "fixtures");
const GROQ = "https://api.groq.com/openai/v1/chat/completions";
const MOCK_REPLY = "MOCK-REPLY-OK";
const TEST_KEY = "gsk_e2e_dummy_key_123";

type ChatBody = { model: string; messages: { role: string; content: string }[] };

/** Intercept Groq: record every request body and answer with a one-token SSE stream. */
async function mockGroq(page: Page, opts: { delayMs?: number } = {}) {
    const bodies: ChatBody[] = [];
    await page.route(GROQ, async (route: Route) => {
        const req = route.request();
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        bodies.push(JSON.parse(req.postData() || "{}"));
        if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs));
        await route.fulfill({
            status: 200,
            headers: { ...cors, "content-type": "text/event-stream" },
            body:
                `data: {"choices":[{"delta":{"content":"${MOCK_REPLY}"}}]}\n\n` +
                `data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":3}}\n\n` +
                `data: [DONE]\n\n`,
        });
    });
    return bodies;
}

/** Run in the page: read or write the app's IndexedDB (`privai-db`). */
async function idb<T>(page: Page, fn: string, arg?: unknown): Promise<T> {
    return page.evaluate(
        async ({ fn, arg }) => {
            const db: IDBDatabase = await new Promise((res, rej) => {
                const r = indexedDB.open("privai-db");
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
            });
            const p = (req: IDBRequest) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
            const out = await new Function("db", "p", "arg", `return (async () => { ${fn} })()`)(db, p, arg);
            db.close();
            return out;
        },
        { fn, arg }
    ) as Promise<T>;
}

/** Load the app once so it creates its DB, store a Groq key, then reload so the app picks it up. */
async function bootWithKey(page: Page, sessions: unknown[] = []) {
    await page.goto("/");
    await expect(page.getByText("Initializing PrivAI...")).toHaveCount(0);
    await idb(page, `
        const tx = db.transaction(["settings", "sessions"], "readwrite");
        tx.objectStore("settings").put({ groq: arg.key }, "apiKeys");
        for (const s of arg.sessions) tx.objectStore("sessions").put(s);
        await new Promise(r => { tx.oncomplete = r; });
    `, { key: TEST_KEY, sessions });
    await page.reload();
    await expect(page.getByText("Initializing PrivAI...")).toHaveCount(0);
}

async function startChat(page: Page) {
    await page.getByRole("button", { name: "Start New Chat" }).click();
    await expect(page.getByPlaceholder(/Message PrivAI/)).toBeVisible();
}

async function send(page: Page, text: string, files: string[] = []) {
    if (files.length) await page.locator('input[type="file"]').setInputFiles(files.map(f => path.join(FIXTURES, f)));
    const box = page.getByPlaceholder(/Message PrivAI/);
    await box.fill(text);
    await box.press("Enter");
}

const lastUser = (b: ChatBody) => [...b.messages].reverse().find(m => m.role === "user")!.content;

// ---------------------------------------------------------------------------------------------

test("privacy copy matches what is actually stored and sent", async ({ page }) => {
    await bootWithKey(page);

    // Fact: the API key sits in IndexedDB as plain text (only .privai backups are encrypted).
    const stored = await idb<Record<string, string>>(page, `return await p(db.transaction("settings").objectStore("settings").get("apiKeys"));`);
    expect(stored.groq).toBe(TEST_KEY);

    // So the UI must not claim keys / chats / storage are encrypted.
    await expect(page.locator("body")).not.toContainText(/encrypted local storage/i);
    await startChat(page);
    await expect(page.locator("body")).not.toContainText(/Conversations are encrypted/i);
    // With a cloud model selected, the input must not claim on-device execution.
    await expect(page.locator("body")).not.toContainText(/On-Device Execution/i);

    await page.getByRole("button", { name: /Settings/ }).click();
    await page.getByRole("button", { name: /Cloud API Keys/ }).click();
    await expect(page.locator("body")).not.toContainText(/Keys are encrypted/i);
});

test("failed / empty assistant turns are not sent back to the model", async ({ page }) => {
    const now = Date.now();
    // Exactly what the app stored before this fix after an auth error and after pressing Stop early.
    const legacy = {
        id: "s-history", title: "History", createdAt: now, updatedAt: now,
        modelConfig: { provider: "groq", modelId: "openai/gpt-oss-20b", temperature: 0.7 },
        messages: [
            { id: "m1", role: "user", content: "first question", timestamp: now },
            { id: "m2", role: "assistant", content: "**Error**: Groq: invalid or missing API key (HTTP 401) — Invalid API Key", timestamp: now },
            { id: "m3", role: "user", content: "second question", timestamp: now },
            { id: "m4", role: "assistant", content: "", timestamp: now },
        ],
    };
    const bodies = await mockGroq(page);
    await bootWithKey(page, [legacy]);
    await page.getByText("History", { exact: true }).click();
    await send(page, "third question");
    await expect(page.getByText(MOCK_REPLY)).toBeVisible();

    const sent = bodies[0].messages;
    expect(sent.filter(m => !m.content.trim()), "empty turns sent").toEqual([]);
    expect(sent.filter(m => m.content.startsWith("**Error**")), "error text sent as an assistant turn").toEqual([]);
    // With the failed replies removed, the user turns are adjacent and get merged into one turn.
    expect(sent).toEqual([{ role: "user", content: "first question\n\nsecond question\n\nthird question" }]);
});

test("a reply that finishes after switching chats is saved", async ({ page }) => {
    await mockGroq(page, { delayMs: 2000 });
    await bootWithKey(page);
    await startChat(page);
    await send(page, "hello from chat A");
    await page.getByRole("button", { name: "New Chat" }).click(); // switch away while A is streaming
    await page.waitForTimeout(5000); // reply lands at ~2s; debounced save is 1s

    const sessions = await idb<{ messages: { role: string; content: string }[] }[]>(page, `return await p(db.transaction("sessions").objectStore("sessions").getAll());`);
    const chatA = sessions.find(s => s.messages.some(m => m.content === "hello from chat A"));
    expect(chatA, "chat A was never written to IndexedDB").toBeTruthy();
    expect(chatA!.messages.find(m => m.role === "assistant")?.content).toBe(MOCK_REPLY);
});

test("PDF attachment: text from a real (compressed) PDF reaches the prompt", async ({ page }) => {
    const bodies = await mockGroq(page);
    await bootWithKey(page);
    await startChat(page);
    await send(page, "What is the quarterly retainer?", ["contract.pdf"]);
    await expect(page.getByText(MOCK_REPLY)).toBeVisible();

    const prompt = lastUser(bodies[0]);
    expect(prompt).toContain("4,750 euros");
    // Excerpts are sent to the provider, so the prompt must not say "zero bytes transmitted".
    expect(prompt).not.toMatch(/zero bytes transmitted/i);
});

test("DOCX attachment: document text reaches the prompt", async ({ page }) => {
    const bodies = await mockGroq(page);
    await bootWithKey(page);
    await startChat(page);
    await send(page, "How many days per week can staff work remotely?", ["handbook.docx"]);
    await expect(page.getByText(MOCK_REPLY)).toBeVisible();
    expect(lastUser(bodies[0])).toContain("three days per week");
});

test("image attachment: no binary junk is sent and the user is told it was not sent", async ({ page }) => {
    const bodies = await mockGroq(page);
    await bootWithKey(page);
    await startChat(page);
    await send(page, "Describe this picture", ["photo.png"]);
    await expect(page.getByText(MOCK_REPLY)).toBeVisible();

    const prompt = lastUser(bodies[0]);
    expect(prompt).not.toMatch(/IHDR|IDAT|�/);
    await expect(page.getByText(/photo\.png.*not sent/i)).toBeVisible();
});

test("encrypted .privai backup round-trips in a real browser", async ({ page }) => {
    const now = Date.now();
    const session = {
        id: "s-backup", title: "Backup me", createdAt: now, updatedAt: now,
        modelConfig: { provider: "groq", modelId: "openai/gpt-oss-20b" },
        messages: [{ id: "b1", role: "user", content: "BACKUP-CANARY-7731", timestamp: now }],
    };
    await bootWithKey(page, [session]);
    await page.getByRole("button", { name: /Settings/ }).click();
    await page.getByRole("button", { name: /Encrypted Backups/ }).click();

    const pass = "correct horse battery staple";
    await page.getByPlaceholder(/passphrase/i).first().fill(pass);
    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: /Export \.privai File/ }).click(),
    ]);
    const file = await download.path();
    const raw = fs.readFileSync(file, "utf8");
    expect(raw).not.toContain("BACKUP-CANARY-7731"); // ciphertext only
    expect(JSON.parse(raw)).toMatchObject({ format: "privai-encrypted", version: 2, iterations: 600000 });

    // Wipe local data, then restore from the file.
    await idb(page, `const tx = db.transaction("sessions", "readwrite"); tx.objectStore("sessions").clear(); await new Promise(r => { tx.oncomplete = r; });`);
    await page.locator('input[type="file"][accept*=".privai"]').setInputFiles(file);
    await page.getByPlaceholder(/passphrase/i).last().fill(pass);
    await page.getByRole("button", { name: /Decrypt & Restore Data/ }).click();
    await expect(page.getByText(/Successfully restored 1 conversations/)).toBeVisible();

    const restored = await idb<{ id: string }[]>(page, `return await p(db.transaction("sessions").objectStore("sessions").getAll());`);
    expect(restored.map(s => s.id)).toContain("s-backup");
});

test("no analytics or third-party requests: only the app itself and the chosen provider", async ({ page }) => {
    const hosts = new Set<string>();
    page.on("request", req => hosts.add(new URL(req.url()).host));
    await mockGroq(page);
    await bootWithKey(page);
    await startChat(page);
    await send(page, "What is the quarterly retainer?", ["contract.pdf"]); // also loads the pdf.js worker
    await expect(page.getByText(MOCK_REPLY)).toBeVisible();

    const appHost = new URL(page.url()).host;
    expect([...hosts].sort()).toEqual([appHost, "api.groq.com"].sort());
});

test("Ollama: 'Test Connection' puts installed models in the model picker, and chat runs locally", async ({ page }) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    await page.route("http://localhost:11434/api/tags", r => r.fulfill({ headers: cors, json: { models: [{ name: "qwen3:8b" }] } }));
    const chats: ChatBody[] = [];
    await page.route("http://localhost:11434/api/chat", async r => {
        if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
        chats.push(JSON.parse(r.request().postData() || "{}"));
        await r.fulfill({
            headers: { ...cors, "content-type": "application/x-ndjson" },
            body: `{"message":{"content":"LOCAL-OK"},"done":false}\n{"message":{"content":""},"done":true,"prompt_eval_count":5,"eval_count":2}\n`,
        });
    });

    await page.goto("/");
    await expect(page.getByText("Initializing PrivAI...")).toHaveCount(0);
    await page.getByRole("button", { name: /Settings/ }).click();
    await page.getByRole("button", { name: /Test Connection/ }).click();
    await expect(page.getByText(/Found 1 model\(s\): qwen3:8b/)).toBeVisible();

    await page.reload(); // the discovered list must survive a reload
    await expect(page.getByText("Initializing PrivAI...")).toHaveCount(0);
    await startChat(page);
    await page.getByRole("button", { name: /COMPUTE CORE|LOCAL RUNTIME/ }).click();
    await page.getByText("qwen3:8b (Ollama)").click();
    await send(page, "hello local model");
    await expect(page.getByText("LOCAL-OK")).toBeVisible();
    expect(chats[0].model).toBe("qwen3:8b");
});

test("works offline after the first visit (service worker precache)", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByText("Initializing PrivAI...")).toHaveCount(0);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload(); // let the now-active worker control the page
    await expect(page.getByText("Initializing PrivAI...")).toHaveCount(0);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("button", { name: "Start New Chat" })).toBeVisible();
    await expect(page.getByText(/You are currently offline/)).toBeVisible();
    await context.setOffline(false);
});
