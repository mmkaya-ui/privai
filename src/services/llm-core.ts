/**
 * Shared streaming + error plumbing for every LLM provider.
 *
 *  - `LLMError`            one error type with a normalized `code` for the UI to act on.
 *  - `providerFetch`       fetch wrapper that maps network / abort / HTTP failures to LLMError.
 *  - `readLines`           byte stream → lines, correct across arbitrary chunk boundaries
 *                          (split mid-line, mid-JSON, mid-UTF-8 sequence, or between \r and \n).
 *  - `readSSE`             lines → Server-Sent Events per the WHATWG spec (multi-line data,
 *                          comments, CRLF, final event without trailing blank line).
 */
import type { LLMErrorCode, LLMProviderType } from "@/types/llm";

export class LLMError extends Error {
    readonly code: LLMErrorCode;
    readonly provider: LLMProviderType | string;
    readonly status?: number;
    readonly retryable: boolean;
    readonly retryAfterMs?: number;

    constructor(opts: {
        code: LLMErrorCode;
        provider: LLMProviderType | string;
        message: string;
        status?: number;
        retryAfterMs?: number;
        cause?: unknown;
    }) {
        super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
        this.code = opts.code;
        this.provider = opts.provider;
        this.status = opts.status;
        this.retryAfterMs = opts.retryAfterMs;
        this.retryable = opts.code === "rate_limit" || opts.code === "server" || opts.code === "network";
        // Keep `err.name === 'AbortError'` checks across the app working for aborts.
        this.name = opts.code === "aborted" ? "AbortError" : "LLMError";
    }
}

export function isAbortError(err: unknown): boolean {
    return (
        (err instanceof LLMError && err.code === "aborted") ||
        (typeof err === "object" && err !== null && (err as { name?: string }).name === "AbortError")
    );
}

export function abortedError(provider: string, cause?: unknown): LLMError {
    return new LLMError({ code: "aborted", provider, message: "Generation stopped", cause });
}

export function codeForStatus(status: number): LLMErrorCode {
    if (status === 401 || status === 403) return "auth";
    if (status === 429) return "rate_limit";
    if (status === 404) return "not_found";
    if (status === 400 || status === 409 || status === 413 || status === 422) return "bad_request";
    if (status >= 500) return "server"; // includes Anthropic's 529 "overloaded"
    return "unknown";
}

/** Pull a human-readable message out of the common provider error envelopes. */
export function extractProviderMessage(body: unknown): string | undefined {
    if (!body || typeof body !== "object") return typeof body === "string" && body.trim() ? body.trim().slice(0, 300) : undefined;
    const b = body as Record<string, unknown>;
    const err = b.error;
    if (typeof err === "string") return err;                                  // Ollama: {"error":"..."}
    if (err && typeof err === "object") {
        const m = (err as Record<string, unknown>).message;                   // OpenAI / Anthropic / Gemini / Groq / DeepSeek
        if (typeof m === "string") return m;
    }
    if (typeof b.message === "string") return b.message;
    if (typeof b.detail === "string") return b.detail;
    return undefined;
}

function parseRetryAfter(value: string | null): number | undefined {
    if (!value) return undefined;
    const secs = Number(value);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

const CODE_HINT: Record<LLMErrorCode, string> = {
    auth: "invalid or missing API key",
    rate_limit: "rate limit or quota exceeded",
    network: "network error",
    aborted: "aborted",
    bad_request: "request rejected",
    not_found: "model or endpoint not found",
    server: "provider is having problems",
    unsupported: "not supported in this environment",
    unknown: "unexpected error",
};

/**
 * Build an LLMError from a non-2xx response. `classify` lets a provider override the
 * status→code mapping (e.g. Gemini returns 400 for an invalid API key).
 */
export async function errorFromResponse(
    provider: { id: string; name: string },
    res: Response,
    classify?: (status: number, body: unknown) => LLMErrorCode | undefined
): Promise<LLMError> {
    const text = await res.text().catch(() => "");
    let body: unknown = text;
    try { body = text ? JSON.parse(text) : undefined; } catch { /* keep raw text */ }

    const code = classify?.(res.status, body) ?? codeForStatus(res.status);
    const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
    const detail = extractProviderMessage(body);
    let message = `${provider.name}: ${CODE_HINT[code]} (HTTP ${res.status})`;
    if (code === "rate_limit" && retryAfterMs !== undefined) message += `, retry in ${Math.ceil(retryAfterMs / 1000)}s`;
    if (detail) message += ` — ${detail}`;

    return new LLMError({ code, provider: provider.id, status: res.status, retryAfterMs, message });
}

/** Map anything thrown by `fetch` (or a stream read) to an LLMError. */
export function errorFromFetchFailure(
    provider: { id: string; name: string; isLocal: boolean },
    err: unknown,
    endpoint: string,
    signal?: AbortSignal
): LLMError {
    if (err instanceof LLMError) return err;
    if (signal?.aborted || isAbortError(err)) return abortedError(provider.id, err);

    let where = endpoint;
    try { where = new URL(endpoint).origin; } catch { /* keep raw */ }

    const message = provider.isLocal
        ? `${provider.name}: could not reach ${where}. Is it running and does it allow this origin (CORS)?`
        : `${provider.name}: network error contacting ${where}. Check your connection; if it persists the endpoint may be blocking browser requests (CORS) — set a custom base URL / gateway.`;
    return new LLMError({ code: "network", provider: provider.id, message, cause: err });
}

/** `fetch` that only ever resolves to an OK response with a body, or throws LLMError. */
export async function providerFetch(
    provider: { id: string; name: string; isLocal: boolean },
    url: string,
    init: RequestInit,
    signal?: AbortSignal,
    classify?: (status: number, body: unknown) => LLMErrorCode | undefined
): Promise<Response & { body: ReadableStream<Uint8Array> }> {
    if (signal?.aborted) throw abortedError(provider.id);
    let res: Response;
    try {
        res = await fetch(url, { ...init, signal });
    } catch (err) {
        throw errorFromFetchFailure(provider, err, url, signal);
    }
    if (!res.ok) throw await errorFromResponse(provider, res, classify);
    if (!res.body) throw new LLMError({ code: "server", provider: provider.id, message: `${provider.name}: empty response body` });
    return res as Response & { body: ReadableStream<Uint8Array> };
}

/**
 * Decode a byte stream into lines. Handles:
 *  - chunks split anywhere (mid-line, mid-JSON, mid-multi-byte UTF-8 character)
 *  - \n, \r\n and lone \r terminators, including a \r\n pair split across two chunks
 *  - a final line without a trailing newline
 *  - abort: cancels the reader and throws `onAbort()`
 *  - early `return()` by the consumer: cancels the reader so the socket is released
 */
export async function* readLines(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
    onAbort: () => Error = () => new DOMException("Aborted", "AbortError")
): AsyncGenerator<string, void, unknown> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let skipLeadingLF = false;
    let finished = false;

    const abortListener = () => { reader.cancel().catch(() => undefined); };
    signal?.addEventListener("abort", abortListener, { once: true });

    try {
        while (true) {
            if (signal?.aborted) throw onAbort();
            const { done, value } = await reader.read();
            if (signal?.aborted) throw onAbort();
            if (done) {
                finished = true;
                buffer += decoder.decode();
                if (buffer) yield buffer;
                return;
            }

            let text = decoder.decode(value, { stream: true });
            if (skipLeadingLF && text.startsWith("\n")) text = text.slice(1);
            skipLeadingLF = false;
            buffer += text;

            let start = 0;
            for (let i = 0; i < buffer.length; i++) {
                const ch = buffer[i];
                if (ch !== "\n" && ch !== "\r") continue;
                yield buffer.slice(start, i);
                if (ch === "\r") {
                    if (i + 1 < buffer.length) {
                        if (buffer[i + 1] === "\n") i++;
                    } else {
                        skipLeadingLF = true; // \r was the last char; a \n may start the next chunk
                    }
                }
                start = i + 1;
            }
            buffer = buffer.slice(start);
        }
    } catch (err) {
        if (signal?.aborted && !(err instanceof LLMError)) throw onAbort();
        throw err;
    } finally {
        signal?.removeEventListener("abort", abortListener);
        if (!finished) await reader.cancel().catch(() => undefined);
        else reader.releaseLock();
    }
}

export interface SSEEvent {
    event?: string;
    data: string;
}

/** Parse Server-Sent Events (text/event-stream) from a byte stream. */
export async function* readSSE(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
    onAbort?: () => Error
): AsyncGenerator<SSEEvent, void, unknown> {
    let data: string[] = [];
    let event: string | undefined;

    for await (const line of readLines(body, signal, onAbort)) {
        if (line === "") {
            if (data.length) yield { event, data: data.join("\n") };
            data = [];
            event = undefined;
            continue;
        }
        if (line.startsWith(":")) continue; // comment / keep-alive
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "data") data.push(value);
        else if (field === "event") event = value;
        // `id` and `retry` are irrelevant for one-shot completions
    }
    // Be lenient: many servers close without the final blank line.
    if (data.length) yield { event, data: data.join("\n") };
}

/** Parse newline-delimited JSON (Ollama's native streaming format). */
export async function* readNDJSON(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
    onAbort?: () => Error
): AsyncGenerator<unknown, void, unknown> {
    for await (const line of readLines(body, signal, onAbort)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            yield JSON.parse(trimmed);
        } catch {
            // A complete line that isn't JSON is not a chunking artefact (readLines guarantees
            // whole lines); skip it rather than abort the whole generation.
        }
    }
}

export function tryParseJSON(data: string): unknown {
    try { return JSON.parse(data); } catch { return undefined; }
}

/** chars/4 — the usual rough heuristic when a backend doesn't report usage. */
export function estimateTokens(text: string): number {
    return text ? Math.max(1, Math.round(text.length / 4)) : 0;
}

/** Join a base URL and a path without doubling slashes. */
export function joinUrl(base: string, path: string): string {
    return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
