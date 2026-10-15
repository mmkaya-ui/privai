/**
 * Provider conformance suite: every HTTP-backed LLMProvider is run through the same
 * matrix with a mocked `fetch`:
 *   - streaming parse with the body split into 1/2/3/7/64-byte chunks (mid-JSON, mid-UTF-8)
 *   - provider-reported token usage
 *   - 401 → auth, 429 → rate_limit (+Retry-After), fetch TypeError → network, 5xx → server
 *   - mid-stream error events
 *   - abort before start / mid-stream (connection cancelled), early consumer break
 */
import { describe, it, expect } from "vitest";
import type { LLMProvider, Message, ModelConfig } from "@/types/llm";
import { LLMError } from "../llm-core";
import { PROVIDERS } from "../llm";
import {
    FULL_TEXT, TOKENS, anthropicWire, byteChunks, chunkedStream, collect, geminiWire, hangingStream,
    jsonResponse, mockFetch, ollamaWire, openAIWire, sse, streamResponse,
} from "./helpers";

const MESSAGES: Message[] = [
    { id: "s", role: "system", content: "Be brief.", timestamp: 0 },
    { id: "u", role: "user", content: "Say hello", timestamp: 0 },
];

interface Case {
    provider: LLMProvider;
    config: ModelConfig;
    apiKey: string;
    wire: () => string;
    contentType?: string;
    url: string;
    /** Assert provider-specific request details. */
    checkRequest: (init: RequestInit) => void;
    usage: { inputTokens: number; outputTokens: number } | null;
    firstChunk: string;
    midStreamError: { wire: string; code: LLMError["code"] };
}

const json = (init: RequestInit) => JSON.parse(String(init.body));
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

const openAIError = sse({ error: { message: "Rate limited upstream", code: 429 } });

const CASES: Case[] = [
    {
        provider: PROVIDERS.openai,
        config: { provider: "openai", modelId: "gpt-4o-mini", temperature: 0.2 },
        apiKey: "sk-test",
        wire: () => openAIWire({ usage: "standard" }),
        url: "https://api.openai.com/v1/chat/completions",
        checkRequest: init => {
            expect(header(init, "authorization")).toBe("Bearer sk-test");
            const body = json(init);
            expect(body).toMatchObject({ model: "gpt-4o-mini", stream: true, temperature: 0.2, stream_options: { include_usage: true } });
            expect(body.messages).toEqual([{ role: "system", content: "Be brief." }, { role: "user", content: "Say hello" }]);
        },
        usage: { inputTokens: 11, outputTokens: 7 },
        firstChunk: sse({ choices: [{ delta: { content: TOKENS[0] } }] }),
        midStreamError: { wire: openAIError, code: "rate_limit" },
    },
    {
        provider: PROVIDERS.groq,
        config: { provider: "groq", modelId: "llama-3.1-8b-instant" },
        apiKey: "gsk-test",
        wire: () => openAIWire({ usage: "groq", eol: "\r\n" }),
        url: "https://api.groq.com/openai/v1/chat/completions",
        checkRequest: init => expect(header(init, "authorization")).toBe("Bearer gsk-test"),
        usage: { inputTokens: 11, outputTokens: 7 },
        firstChunk: sse({ choices: [{ delta: { content: TOKENS[0] } }] }),
        midStreamError: { wire: openAIError, code: "rate_limit" },
    },
    {
        provider: PROVIDERS.deepseek,
        config: { provider: "deepseek", modelId: "deepseek-chat" },
        apiKey: "ds-test",
        wire: () => openAIWire({ usage: "standard" }),
        url: "https://api.deepseek.com/chat/completions",
        checkRequest: init => expect(json(init).model).toBe("deepseek-chat"),
        usage: { inputTokens: 11, outputTokens: 7 },
        firstChunk: sse({ choices: [{ delta: { content: TOKENS[0] } }] }),
        midStreamError: { wire: openAIError, code: "rate_limit" },
    },
    {
        provider: PROVIDERS.lmstudio,
        config: { provider: "lmstudio", modelId: "local-model", baseUrl: "http://localhost:1234" },
        apiKey: "",
        wire: () => openAIWire({ usage: "none" }),
        url: "http://localhost:1234/v1/chat/completions",
        checkRequest: init => {
            expect(header(init, "authorization")).toBeNull();
            expect(json(init).stream_options).toBeUndefined();
        },
        usage: null,
        firstChunk: sse({ choices: [{ delta: { content: TOKENS[0] } }] }),
        midStreamError: { wire: sse({ error: "model crashed" }), code: "server" },
    },
    {
        provider: PROVIDERS.custom,
        config: { provider: "custom", modelId: "meta-llama/llama-3.3-70b", baseUrl: "https://openrouter.ai/api/v1/" },
        apiKey: "or-test",
        wire: () => openAIWire({ usage: "standard" }),
        url: "https://openrouter.ai/api/v1/chat/completions",
        checkRequest: init => expect(header(init, "authorization")).toBe("Bearer or-test"),
        usage: { inputTokens: 11, outputTokens: 7 },
        firstChunk: sse({ choices: [{ delta: { content: TOKENS[0] } }] }),
        midStreamError: { wire: openAIError, code: "rate_limit" },
    },
    {
        provider: PROVIDERS.anthropic,
        config: { provider: "anthropic", modelId: "claude-sonnet", temperature: 0.5 },
        apiKey: "sk-ant-test",
        wire: anthropicWire,
        url: "https://api.anthropic.com/v1/messages",
        checkRequest: init => {
            expect(header(init, "x-api-key")).toBe("sk-ant-test");
            expect(header(init, "anthropic-version")).toBe("2023-06-01");
            expect(header(init, "anthropic-dangerous-direct-browser-access")).toBe("true");
            const body = json(init);
            expect(body.system).toBe("Be brief.");
            expect(body.messages).toEqual([{ role: "user", content: "Say hello" }]);
        },
        usage: { inputTokens: 11, outputTokens: 7 },
        firstChunk: sse({ type: "content_block_delta", delta: { type: "text_delta", text: TOKENS[0] } }, "content_block_delta"),
        midStreamError: { wire: sse({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "error"), code: "server" },
    },
    {
        provider: PROVIDERS.gemini,
        config: { provider: "gemini", modelId: "gemini-flash" },
        apiKey: "AIza-test",
        wire: geminiWire,
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash:streamGenerateContent?alt=sse",
        checkRequest: init => {
            expect(header(init, "x-goog-api-key")).toBe("AIza-test");
            const body = json(init);
            expect(body.systemInstruction).toEqual({ parts: [{ text: "Be brief." }] });
            expect(body.contents).toEqual([{ role: "user", parts: [{ text: "Say hello" }] }]);
        },
        usage: { inputTokens: 11, outputTokens: 7 },
        firstChunk: `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: TOKENS[0] }] } }] })}\n\n`,
        midStreamError: { wire: sse({ error: { code: 429, message: "Resource exhausted", status: "RESOURCE_EXHAUSTED" } }), code: "rate_limit" },
    },
    {
        provider: PROVIDERS.ollama,
        config: { provider: "ollama", modelId: "llama3.2" },
        apiKey: "",
        wire: ollamaWire,
        contentType: "application/x-ndjson",
        url: "http://localhost:11434/api/chat",
        checkRequest: init => expect(json(init)).toMatchObject({ model: "llama3.2", stream: true }),
        usage: { inputTokens: 11, outputTokens: 7 },
        firstChunk: JSON.stringify({ message: { content: TOKENS[0] }, done: false }) + "\n",
        midStreamError: { wire: JSON.stringify({ error: "model 'llama3.2' not found, try pulling it first" }) + "\n", code: "not_found" },
    },
];

describe.each(CASES)("$provider.id provider", c => {
    const run = (signal?: AbortSignal) => c.provider.stream(MESSAGES, c.config, c.apiKey, signal);

    it("conforms to the LLMProvider shape", () => {
        expect(PROVIDERS[c.provider.id]).toBe(c.provider);
        expect(typeof c.provider.name).toBe("string");
        expect(typeof c.provider.isLocal).toBe("boolean");
        expect(typeof c.provider.requiresApiKey).toBe("boolean");
        expect(typeof c.provider.stream).toBe("function");
    });

    it.each([1, 2, 3, 7, 64, 100_000])("parses the stream split into %i-byte chunks", async size => {
        const fetchMock = mockFetch(() => streamResponse(chunkedStream(byteChunks(c.wire(), size)).stream, c.contentType));
        const out = await collect(run());

        expect(out.text).toBe(FULL_TEXT);
        if (c.usage) expect(out.usage).toEqual(c.usage);
        else expect(out.usage).toEqual({});

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(c.url);
        expect(init.method).toBe("POST");
        c.checkRequest(init);
    });

    it("maps 401 to an auth error with the provider's message", async () => {
        mockFetch(() => jsonResponse(401, { error: { message: "Incorrect API key provided" } }));
        const err = await collect(run()).catch(e => e);
        expect(err).toBeInstanceOf(LLMError);
        expect(err).toMatchObject({ code: "auth", status: 401, provider: c.provider.id, retryable: false });
        expect(err.message).toContain("Incorrect API key provided");
    });

    it("maps 429 to rate_limit and honours Retry-After", async () => {
        mockFetch(() => jsonResponse(429, { error: { message: "Too many requests" } }, { "retry-after": "7" }));
        const err = await collect(run()).catch(e => e);
        expect(err).toMatchObject({ code: "rate_limit", status: 429, retryable: true, retryAfterMs: 7000 });
        expect(err.message).toMatch(/retry in 7s/);
    });

    it("maps 5xx to a retryable server error", async () => {
        mockFetch(() => new Response("upstream exploded", { status: 503 }));
        const err = await collect(run()).catch(e => e);
        expect(err).toMatchObject({ code: "server", status: 503, retryable: true });
    });

    it("maps a fetch TypeError to a network error", async () => {
        mockFetch(() => { throw new TypeError("Failed to fetch"); });
        const err = await collect(run()).catch(e => e);
        expect(err).toMatchObject({ code: "network", retryable: true });
        expect(err.message).toMatch(c.provider.isLocal ? /Is it running/ : /network error/);
    });

    it("surfaces mid-stream error events as LLMError", async () => {
        mockFetch(() => streamResponse(chunkedStream(byteChunks(c.firstChunk + c.midStreamError.wire, 5)).stream, c.contentType));
        const err = await collect(run()).catch(e => e);
        expect(err).toBeInstanceOf(LLMError);
        expect(err.code).toBe(c.midStreamError.code);
    });

    it("rejects immediately when the signal is already aborted", async () => {
        const fetchMock = mockFetch(() => streamResponse(chunkedStream([]).stream));
        const ctrl = new AbortController();
        ctrl.abort();
        const err = await collect(run(ctrl.signal)).catch(e => e);
        expect(err).toMatchObject({ code: "aborted", name: "AbortError" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("aborts mid-stream and cancels the connection", async () => {
        const body = hangingStream(c.firstChunk);
        mockFetch((_url, init) => {
            expect(init.signal).toBeInstanceOf(AbortSignal);
            return streamResponse(body.stream, c.contentType);
        });
        const ctrl = new AbortController();
        const gen = run(ctrl.signal);

        const first = await gen.next();
        expect(first.value).toEqual({ type: "token", text: TOKENS[0] });

        const pending = gen.next();
        ctrl.abort();
        await expect(pending).rejects.toMatchObject({ code: "aborted", name: "AbortError" });
        expect(body.cancelled()).toBe(true);
    });

    it("releases the connection when the consumer stops early", async () => {
        const body = chunkedStream(byteChunks(c.wire(), 16));
        mockFetch(() => streamResponse(body.stream, c.contentType));
        for await (const evt of run()) {
            if (evt.type === "token") break;
        }
        expect(body.cancelled()).toBe(true);
    });

    if (c.provider.requiresApiKey) {
        it("fails fast with an auth error when no key is configured", async () => {
            const fetchMock = mockFetch(() => streamResponse(chunkedStream([]).stream));
            const err = await collect(c.provider.stream(MESSAGES, c.config, "")).catch(e => e);
            expect(err).toMatchObject({ code: "auth" });
            expect(fetchMock).not.toHaveBeenCalled();
        });
    }
});

describe("registry", () => {
    it("has a conforming provider for every LLMProviderType", () => {
        const ids = Object.keys(PROVIDERS).sort();
        expect(ids).toEqual(["anthropic", "custom", "deepseek", "gemini", "groq", "lmstudio", "ollama", "openai", "webllm"]);
        for (const [id, p] of Object.entries(PROVIDERS)) expect(p.id).toBe(id);
        // every HTTP provider is exercised above; WebLLM has its own suite (no fetch involved)
        expect(new Set(CASES.map(c => c.provider.id))).toEqual(new Set(ids.filter(i => i !== "webllm")));
    });

    it("custom provider requires a base URL", async () => {
        const err = await collect(PROVIDERS.custom.stream(MESSAGES, { provider: "custom", modelId: "x" }, "")).catch(e => e);
        expect(err).toMatchObject({ code: "bad_request" });
    });

    it("Gemini maps its 400 API_KEY_INVALID response to auth", async () => {
        mockFetch(() => jsonResponse(400, { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } }));
        const err = await collect(PROVIDERS.gemini.stream(MESSAGES, { provider: "gemini", modelId: "m" }, "bad")).catch(e => e);
        expect(err).toMatchObject({ code: "auth", status: 400 });
    });

    it("OpenAI omits temperature for reasoning models", async () => {
        const fetchMock = mockFetch(() => streamResponse(chunkedStream(byteChunks(openAIWire(), 64)).stream));
        await collect(PROVIDERS.openai.stream(MESSAGES, { provider: "openai", modelId: "o3-mini", temperature: 0.7 }, "sk"));
        expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).temperature).toBeUndefined();
    });
});
