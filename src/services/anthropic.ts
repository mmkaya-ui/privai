import type { LLMProvider, LLMStreamEvent, Message, ModelConfig } from "@/types/llm";
import { LLMError, abortedError, errorFromFetchFailure, providerFetch, readSSE, tryParseJSON } from "./llm-core";

/**
 * Anthropic Messages API (streaming).
 *
 * Wire format (named SSE events):
 *   event: message_start        data: {"message":{"usage":{"input_tokens":25,"output_tokens":1}}}
 *   event: content_block_delta  data: {"delta":{"type":"text_delta","text":"Hi"}}
 *   event: message_delta        data: {"usage":{"output_tokens":15}}
 *   event: message_stop
 *   event: error                data: {"error":{"type":"overloaded_error","message":"Overloaded"}}
 */
const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";

interface AnthropicEvent {
    type?: string;
    message?: { usage?: { input_tokens?: number; output_tokens?: number } };
    delta?: { type?: string; text?: string };
    usage?: { output_tokens?: number; input_tokens?: number };
    error?: { type?: string; message?: string };
}

const ERROR_TYPE_CODE: Record<string, LLMError["code"]> = {
    authentication_error: "auth",
    permission_error: "auth",
    rate_limit_error: "rate_limit",
    overloaded_error: "server",
    api_error: "server",
    invalid_request_error: "bad_request",
    not_found_error: "not_found",
    request_too_large: "bad_request",
};

export const AnthropicProvider: LLMProvider = {
    id: "anthropic",
    name: "Anthropic",
    isLocal: false,
    requiresApiKey: true,

    async *stream(messages: Message[], config: ModelConfig, apiKey: string, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent> {
        if (!apiKey) throw new LLMError({ code: "auth", provider: "anthropic", message: "Anthropic: API key required. Add one in Settings." });

        const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
        const endpoint = config.baseUrl?.trim() || DEFAULT_ENDPOINT;

        const res = await providerFetch(AnthropicProvider, endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                // Required by Anthropic for direct browser-side API calls (enables CORS).
                "anthropic-dangerous-direct-browser-access": "true",
            },
            body: JSON.stringify({
                model: config.modelId,
                max_tokens: 4096,
                messages: messages
                    .filter(m => m.role !== "system")
                    .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
                ...(system && { system }),
                ...(config.temperature !== undefined && { temperature: Math.min(config.temperature, 1) }),
                stream: true,
            }),
        }, signal);

        try {
            for await (const evt of readSSE(res.body, signal, () => abortedError("anthropic"))) {
                const json = tryParseJSON(evt.data) as AnthropicEvent | undefined;
                if (!json) continue;
                const type = json.type ?? evt.event;

                switch (type) {
                    case "message_start": {
                        const u = json.message?.usage;
                        if (u?.input_tokens != null) yield { type: "usage", usage: { inputTokens: u.input_tokens } };
                        break;
                    }
                    case "content_block_delta":
                        if (json.delta?.type === "text_delta" && json.delta.text) yield { type: "token", text: json.delta.text };
                        break;
                    case "message_delta":
                        if (json.usage?.output_tokens != null) yield { type: "usage", usage: { outputTokens: json.usage.output_tokens } };
                        break;
                    case "message_stop":
                        return;
                    case "error": {
                        const t = json.error?.type ?? "api_error";
                        throw new LLMError({
                            code: ERROR_TYPE_CODE[t] ?? "server",
                            provider: "anthropic",
                            message: `Anthropic: ${json.error?.message ?? t}`,
                        });
                    }
                }
            }
        } catch (err) {
            throw errorFromFetchFailure(AnthropicProvider, err, endpoint, signal);
        }
    },
};
