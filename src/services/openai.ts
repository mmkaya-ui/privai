import type { LLMErrorCode, LLMProvider, LLMProviderType, LLMStreamEvent, Message, ModelConfig } from "@/types/llm";
import { LLMError, abortedError, errorFromFetchFailure, joinUrl, providerFetch, readSSE, tryParseJSON } from "./llm-core";

/**
 * One implementation for every backend that speaks the OpenAI Chat Completions
 * streaming protocol: OpenAI, Groq, DeepSeek, LM Studio, vLLM, OpenRouter, LiteLLM…
 *
 * Wire format (text/event-stream):
 *   data: {"choices":[{"delta":{"content":"Hel"}}]}
 *   data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":34}}   ← with stream_options.include_usage
 *   data: [DONE]
 */
export interface OpenAICompatibleOptions {
    id: LLMProviderType;
    name: string;
    /** Full chat-completions URL used when the user hasn't set a custom base URL. */
    defaultEndpoint?: string;
    isLocal: boolean;
    requiresApiKey: boolean;
    /** Ask for a final usage chunk (`stream_options.include_usage`). */
    streamUsage: boolean;
    /** Models that reject `temperature` (OpenAI reasoning models). */
    omitTemperature?: (modelId: string) => boolean;
    classify?: (status: number, body: unknown) => LLMErrorCode | undefined;
}

/** Accepts a base (`…/v1`, `…/api/v1`, `http://localhost:1234`) or a full endpoint. */
export function resolveChatCompletionsUrl(baseUrl: string | undefined, fallback: string | undefined, appendV1 = false): string | undefined {
    const raw = baseUrl?.trim();
    if (!raw) return fallback;
    const clean = raw.replace(/\/+$/, "");
    if (/\/chat\/completions$/.test(clean)) return clean;
    if (appendV1 && !/\/v\d+$/.test(clean)) return joinUrl(clean, "v1/chat/completions");
    return joinUrl(clean, "chat/completions");
}

interface OpenAIChunk {
    choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
    x_groq?: { usage?: { prompt_tokens?: number; completion_tokens?: number } };
    error?: { message?: string; type?: string; code?: string | number } | string;
}

export function createOpenAICompatibleProvider(opts: OpenAICompatibleOptions & { appendV1?: boolean }): LLMProvider {
    const provider: LLMProvider = {
        id: opts.id,
        name: opts.name,
        isLocal: opts.isLocal,
        requiresApiKey: opts.requiresApiKey,

        async *stream(messages: Message[], config: ModelConfig, apiKey: string, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent> {
            if (opts.requiresApiKey && !apiKey) {
                throw new LLMError({ code: "auth", provider: opts.id, message: `${opts.name}: API key required. Add one in Settings.` });
            }
            const endpoint = resolveChatCompletionsUrl(config.baseUrl, opts.defaultEndpoint, opts.appendV1);
            if (!endpoint) {
                throw new LLMError({ code: "bad_request", provider: opts.id, message: `${opts.name}: no endpoint configured. Set a base URL in Settings.` });
            }

            const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" };
            if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

            const res = await providerFetch(provider, endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: config.modelId,
                    messages: messages.map(m => ({ role: m.role, content: m.content })),
                    ...(!opts.omitTemperature?.(config.modelId) && { temperature: config.temperature ?? 0.7 }),
                    stream: true,
                    ...(opts.streamUsage && { stream_options: { include_usage: true } }),
                }),
            }, signal, opts.classify);

            try {
                for await (const evt of readSSE(res.body, signal, () => abortedError(opts.id))) {
                    if (evt.data === "[DONE]") return;
                    const json = tryParseJSON(evt.data) as OpenAIChunk | undefined;
                    if (!json) continue;

                    // Some gateways (OpenRouter, vLLM) report failures mid-stream with HTTP 200.
                    if (json.error) {
                        const msg = typeof json.error === "string" ? json.error : json.error.message || "stream error";
                        const status = typeof json.error === "object" && typeof json.error.code === "number" ? json.error.code : undefined;
                        throw new LLMError({
                            code: status === 429 ? "rate_limit" : status === 401 ? "auth" : "server",
                            provider: opts.id, status, message: `${opts.name}: ${msg}`,
                        });
                    }

                    const text = json.choices?.[0]?.delta?.content;
                    if (text) yield { type: "token", text };

                    const usage = json.usage ?? json.x_groq?.usage;
                    if (usage && (usage.prompt_tokens != null || usage.completion_tokens != null)) {
                        yield {
                            type: "usage",
                            usage: {
                                ...(usage.prompt_tokens != null && { inputTokens: usage.prompt_tokens }),
                                ...(usage.completion_tokens != null && { outputTokens: usage.completion_tokens }),
                            },
                        };
                    }
                }
            } catch (err) {
                throw errorFromFetchFailure(provider, err, endpoint, signal);
            }
        },
    };
    return provider;
}

const isOpenAIReasoningModel = (id: string) => /^(o\d|gpt-([5-9]|\d{2}))/.test(id);

export const OpenAIProvider = createOpenAICompatibleProvider({
    id: "openai",
    name: "OpenAI",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    isLocal: false,
    requiresApiKey: true,
    streamUsage: true,
    omitTemperature: isOpenAIReasoningModel,
});

export const GroqProvider = createOpenAICompatibleProvider({
    id: "groq",
    name: "Groq",
    defaultEndpoint: "https://api.groq.com/openai/v1/chat/completions",
    isLocal: false,
    requiresApiKey: true,
    streamUsage: true,
});

export const DeepSeekProvider = createOpenAICompatibleProvider({
    id: "deepseek",
    name: "DeepSeek",
    defaultEndpoint: "https://api.deepseek.com/chat/completions",
    isLocal: false,
    requiresApiKey: true,
    streamUsage: true,
});

/** Any OpenAI-compatible endpoint the user points at (vLLM, LocalAI, OpenRouter, LiteLLM…). */
export const CustomProvider = createOpenAICompatibleProvider({
    id: "custom",
    name: "Custom endpoint",
    isLocal: false,
    requiresApiKey: false,
    streamUsage: true,
});
