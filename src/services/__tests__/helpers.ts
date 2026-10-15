/**
 * Test helpers: build provider wire-format bodies and stream them back in
 * arbitrarily small byte chunks so parsers are exercised across every boundary.
 */
import { vi } from "vitest";
import type { LLMStreamEvent } from "@/types/llm";

export const TOKENS = ["Hel", "lo, ", "wörld ", "🌍", " — done!"];
export const FULL_TEXT = TOKENS.join("");

/** Split a string's UTF-8 bytes into fixed-size chunks (so multi-byte chars get cut too). */
export function byteChunks(text: string, size: number): Uint8Array[] {
    const bytes = new TextEncoder().encode(text);
    const out: Uint8Array[] = [];
    for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
    return out;
}

export interface TrackedStream {
    stream: ReadableStream<Uint8Array>;
    cancelled: () => boolean;
}

/** A body that emits `chunks` and then closes. */
export function chunkedStream(chunks: Uint8Array[]): TrackedStream {
    let wasCancelled = false;
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (i < chunks.length) controller.enqueue(chunks[i++]);
            else controller.close();
        },
        cancel() { wasCancelled = true; },
    });
    return { stream, cancelled: () => wasCancelled };
}

/** A body that emits `first` and then hangs forever (until cancelled) — for abort tests. */
export function hangingStream(first: string): TrackedStream {
    let wasCancelled = false;
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (!sent) {
                sent = true;
                controller.enqueue(new TextEncoder().encode(first));
                return;
            }
            return new Promise<void>(() => { /* never resolves */ });
        },
        cancel() { wasCancelled = true; },
    });
    return { stream, cancelled: () => wasCancelled };
}

export function streamResponse(body: ReadableStream<Uint8Array>, contentType = "text/event-stream") {
    return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
    const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => impl(String(input), init ?? {}));
    vi.stubGlobal("fetch", fn);
    return fn;
}

export async function collect(gen: AsyncGenerator<LLMStreamEvent>) {
    let text = "";
    const tokens: string[] = [];
    const usage: Record<string, number> = {};
    for await (const evt of gen) {
        if (evt.type === "token") { tokens.push(evt.text); text += evt.text; }
        else Object.assign(usage, evt.usage);
    }
    return { text, tokens, usage };
}

// ---- Wire-format builders -------------------------------------------------

export const sse = (data: unknown, event?: string, eol = "\n") =>
    `${event ? `event: ${event}${eol}` : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}${eol}${eol}`;

export function openAIWire(opts: { usage?: "standard" | "groq" | "none"; eol?: string } = {}) {
    const eol = opts.eol ?? "\n";
    let out = `: keep-alive comment${eol}${eol}`;
    out += sse({ choices: [{ delta: { role: "assistant" } }] }, undefined, eol);
    for (const t of TOKENS) out += sse({ choices: [{ delta: { content: t } }] }, undefined, eol);
    if (opts.usage === "standard") out += sse({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 7 } }, undefined, eol);
    if (opts.usage === "groq") out += sse({ choices: [{ delta: {}, finish_reason: "stop" }], x_groq: { usage: { prompt_tokens: 11, completion_tokens: 7 } } }, undefined, eol);
    out += `data: [DONE]${eol}${eol}`;
    return out;
}

export function anthropicWire() {
    let out = sse({ type: "message_start", message: { usage: { input_tokens: 11, output_tokens: 1 } } }, "message_start");
    out += sse({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, "content_block_start");
    out += `event: ping\ndata: {"type": "ping"}\n\n`;
    for (const t of TOKENS) out += sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } }, "content_block_delta");
    out += sse({ type: "content_block_stop", index: 0 }, "content_block_stop");
    out += sse({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 7 } }, "message_delta");
    out += sse({ type: "message_stop" }, "message_stop");
    return out;
}

export function geminiWire() {
    let out = "";
    TOKENS.forEach((t, i) => {
        out += `data: ${JSON.stringify({
            candidates: [{ content: { role: "model", parts: [{ text: t }] } }],
            usageMetadata: { promptTokenCount: 11, candidatesTokenCount: i + 3 },
        })}\r\n\r\n`;
    });
    return out; // Gemini terminates by closing the stream (no [DONE])
}

export function ollamaWire() {
    let out = "";
    for (const t of TOKENS) out += JSON.stringify({ model: "llama3.2", message: { role: "assistant", content: t }, done: false }) + "\n";
    out += JSON.stringify({ model: "llama3.2", message: { role: "assistant", content: "" }, done: true, prompt_eval_count: 11, eval_count: 7 });
    return out; // final line deliberately has no trailing newline
}
