import type { LLMProvider, LLMStreamEvent, Message, ModelConfig } from "@/types/llm";
import { LLMError, abortedError, errorFromFetchFailure, joinUrl, providerFetch, readNDJSON } from "./llm-core";
import { createOpenAICompatibleProvider } from "./openai";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_LMSTUDIO_URL = "http://localhost:1234/v1";

/**
 * Checks if local Ollama instance is reachable and returns installed models
 */
export async function checkOllamaConnection(baseUrl = DEFAULT_OLLAMA_URL): Promise<{ ok: boolean; models: string[]; error?: string }> {
    try {
        const cleanBase = baseUrl.replace(/\/+$/, '');
        const res = await fetch(`${cleanBase}/api/tags`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(3000)
        });
        if (!res.ok) {
            return { ok: false, models: [], error: `Ollama returned HTTP ${res.status}` };
        }
        const data = await res.json() as { models?: Array<{ name: string }> };
        const models = (data.models || []).map(m => m.name).filter(Boolean);
        return { ok: true, models };
    } catch (err: unknown) {
        const error = err as Error;
        return {
            ok: false,
            models: [],
            error: error.name === 'TimeoutError'
                ? 'Connection timed out (is Ollama running?)'
                : 'Could not connect to Ollama on localhost:11434'
        };
    }
}

/**
 * Checks LM Studio connection (OpenAI-compatible /v1/models endpoint)
 */
export async function checkLMStudioConnection(baseUrl = DEFAULT_LMSTUDIO_URL): Promise<{ ok: boolean; models: string[]; error?: string }> {
    try {
        let cleanBase = baseUrl.replace(/\/+$/, '');
        if (!cleanBase.endsWith('/v1')) cleanBase = `${cleanBase}/v1`;
        const res = await fetch(`${cleanBase}/models`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(3000)
        });
        if (!res.ok) {
            return { ok: false, models: [], error: `LM Studio returned HTTP ${res.status}` };
        }
        const data = await res.json() as { data?: Array<{ id: string }> };
        const models = (data.data || []).map(m => m.id).filter(Boolean);
        return { ok: true, models };
    } catch {
        return {
            ok: false,
            models: [],
            error: 'Could not connect to LM Studio on localhost:1234'
        };
    }
}

/**
 * Ollama native `/api/chat` streaming (newline-delimited JSON, not SSE).
 *
 *   {"message":{"role":"assistant","content":"Hel"},"done":false}
 *   {"message":{"role":"assistant","content":""},"done":true,"prompt_eval_count":26,"eval_count":298}
 *   {"error":"model 'llama9' not found"}
 */
interface OllamaChunk {
    message?: { content?: string };
    done?: boolean;
    prompt_eval_count?: number;
    eval_count?: number;
    error?: string;
}

export const OllamaProvider: LLMProvider = {
    id: "ollama",
    name: "Ollama (Local)",
    isLocal: true,
    requiresApiKey: false,

    async *stream(messages: Message[], config: ModelConfig, _apiKey: string, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent> {
        const baseUrl = (config.baseUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, "").replace(/\/v1$/, "");
        const endpoint = joinUrl(baseUrl, "api/chat");

        const res = await providerFetch(OllamaProvider, endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: config.modelId,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                options: { temperature: config.temperature ?? 0.7 },
                stream: true,
            }),
        }, signal);

        try {
            for await (const raw of readNDJSON(res.body, signal, () => abortedError("ollama"))) {
                const json = raw as OllamaChunk;
                if (json.error) {
                    const notFound = /not found|pull/i.test(json.error);
                    throw new LLMError({
                        code: notFound ? "not_found" : "server",
                        provider: "ollama",
                        message: `Ollama: ${json.error}${notFound ? ` — run \`ollama pull ${config.modelId}\`` : ""}`,
                    });
                }
                if (json.message?.content) yield { type: "token", text: json.message.content };
                if (json.done) {
                    if (json.prompt_eval_count != null || json.eval_count != null) {
                        yield {
                            type: "usage",
                            usage: {
                                ...(json.prompt_eval_count != null && { inputTokens: json.prompt_eval_count }),
                                ...(json.eval_count != null && { outputTokens: json.eval_count }),
                            },
                        };
                    }
                    return;
                }
            }
        } catch (err) {
            throw errorFromFetchFailure(OllamaProvider, err, endpoint, signal);
        }
    },
};

/** LM Studio exposes an OpenAI-compatible server; reuse the shared implementation. */
export const LMStudioProvider = createOpenAICompatibleProvider({
    id: "lmstudio",
    name: "LM Studio (Local)",
    defaultEndpoint: `${DEFAULT_LMSTUDIO_URL}/chat/completions`,
    isLocal: true,
    requiresApiKey: false,
    streamUsage: false,
    appendV1: true,
});
