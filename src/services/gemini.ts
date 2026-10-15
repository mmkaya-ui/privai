import type { LLMProvider, LLMStreamEvent, Message, ModelConfig } from "@/types/llm";
import { LLMError, abortedError, errorFromFetchFailure, providerFetch, readSSE, tryParseJSON } from "./llm-core";

/**
 * Google Gemini `streamGenerateContent` with `alt=sse`.
 *
 * Wire format:
 *   data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}],"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":1}}
 *
 * The API key travels in the `x-goog-api-key` header, not the `?key=` query string,
 * so it never ends up in URLs (history, logs, Referer).
 */
const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiChunk {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    promptFeedback?: { blockReason?: string };
    error?: { message?: string; code?: number; status?: string };
}

/** Gemini answers an invalid key with 400 INVALID_ARGUMENT; treat it as an auth failure. */
function classifyGemini(status: number, body: unknown) {
    const text = JSON.stringify(body ?? "");
    if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(text)) return "auth" as const;
    return undefined;
}

export const GeminiProvider: LLMProvider = {
    id: "gemini",
    name: "Google Gemini",
    isLocal: false,
    requiresApiKey: true,

    async *stream(messages: Message[], config: ModelConfig, apiKey: string, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent> {
        if (!apiKey) throw new LLMError({ code: "auth", provider: "gemini", message: "Google Gemini: API key required. Add one in Settings." });

        const base = (config.baseUrl?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
        const endpoint = `${base}/models/${encodeURIComponent(config.modelId)}:streamGenerateContent?alt=sse`;
        const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");

        const res = await providerFetch(GeminiProvider, endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
                contents: messages
                    .filter(m => m.role !== "system")
                    .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
                ...(system && { systemInstruction: { parts: [{ text: system }] } }),
                generationConfig: { temperature: config.temperature ?? 0.7 },
            }),
        }, signal, classifyGemini);

        try {
            for await (const evt of readSSE(res.body, signal, () => abortedError("gemini"))) {
                const json = tryParseJSON(evt.data) as GeminiChunk | undefined;
                if (!json) continue;

                if (json.error) {
                    throw new LLMError({
                        code: json.error.code === 429 ? "rate_limit" : "server",
                        provider: "gemini", status: json.error.code,
                        message: `Google Gemini: ${json.error.message ?? json.error.status ?? "stream error"}`,
                    });
                }
                if (json.promptFeedback?.blockReason) {
                    throw new LLMError({
                        code: "bad_request", provider: "gemini",
                        message: `Google Gemini: prompt blocked (${json.promptFeedback.blockReason})`,
                    });
                }

                const text = (json.candidates?.[0]?.content?.parts ?? [])
                    .filter(p => !p.thought && p.text)
                    .map(p => p.text)
                    .join("");
                if (text) yield { type: "token", text };

                // usageMetadata is cumulative; the last one wins in streamChat.
                const u = json.usageMetadata;
                if (u && (u.promptTokenCount != null || u.candidatesTokenCount != null)) {
                    yield {
                        type: "usage",
                        usage: {
                            ...(u.promptTokenCount != null && { inputTokens: u.promptTokenCount }),
                            ...(u.candidatesTokenCount != null && { outputTokens: u.candidatesTokenCount }),
                        },
                    };
                }
            }
        } catch (err) {
            throw errorFromFetchFailure(GeminiProvider, err, endpoint, signal);
        }
    },
};
