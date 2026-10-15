import type { LLMProvider, LLMProviderType, Message, MessageTelemetry, ModelConfig, TokenUsage } from "@/types/llm";
import { LLMError, abortedError, estimateTokens, isAbortError } from "./llm-core";
import { estimateCost } from "./models";

// Registry
import { OpenAIProvider, GroqProvider, DeepSeekProvider, CustomProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OllamaProvider, LMStudioProvider } from "./ollama";
import { WebLLMProvider } from "./webllm";

export const PROVIDERS: Readonly<Record<LLMProviderType, LLMProvider>> = {
    openai: OpenAIProvider,
    anthropic: AnthropicProvider,
    gemini: GeminiProvider,
    deepseek: DeepSeekProvider,
    groq: GroqProvider,
    ollama: OllamaProvider,
    lmstudio: LMStudioProvider,
    webllm: WebLLMProvider,
    custom: CustomProvider,
};

export function getProvider(providerId: string): LLMProvider {
    const p = (PROVIDERS as Record<string, LLMProvider | undefined>)[providerId];
    if (!p) throw new LLMError({ code: "unsupported", provider: providerId, message: `Provider "${providerId}" is not implemented` });
    return p;
}

export interface StreamProgress {
    content: string;
    telemetry?: MessageTelemetry;
}

export interface StreamResult {
    content: string;
    telemetry: MessageTelemetry;
}

type Clock = () => number;
const defaultClock: Clock = () => performance.now();

/**
 * Provider-agnostic streaming loop with token + cost accounting.
 *
 * Token counts come from the provider's own usage report when available (OpenAI/Groq/
 * DeepSeek `stream_options.include_usage`, Anthropic `message_start`/`message_delta`,
 * Gemini `usageMetadata`, Ollama `eval_count`, WebLLM `usage`). Otherwise they fall back
 * to the chars/4 heuristic and telemetry is marked `usageSource: 'estimated'`.
 *
 * Throughput is output tokens / decode time (first token → last token), so slow
 * time-to-first-token isn't double-counted; TTFT is reported separately.
 */
export async function streamChat(
    messages: Message[],
    config: ModelConfig,
    apiKey: string,
    onProgress: (progress: StreamProgress) => void,
    signal?: AbortSignal,
    clock: Clock = defaultClock
): Promise<StreamResult> {
    const provider = getProvider(config.provider);
    const isLocal = provider.isLocal;
    const startTime = clock();
    const estimatedInput = Math.max(1, messages.reduce((acc, m) => acc + estimateTokens(m.content), 0));

    let content = "";
    let firstTokenAt: number | null = null;
    const reported: Partial<TokenUsage> = {};

    const telemetryNow = (): MessageTelemetry => {
        const now = clock();
        const outputTokens = reported.outputTokens ?? estimateTokens(content);
        const inputTokens = reported.inputTokens ?? estimatedInput;
        const decodeSeconds = firstTokenAt === null ? 0 : (now - firstTokenAt) / 1000;
        // Need a little decode time before a rate means anything.
        const tokPerSec = decodeSeconds >= 0.05 ? Math.round((outputTokens / decodeSeconds) * 10) / 10 : 0;
        return {
            tokens: outputTokens,
            inputTokens,
            tokPerSec,
            ttftMs: firstTokenAt === null ? undefined : Math.round(firstTokenAt - startTime),
            durationMs: Math.round(now - startTime),
            cost: isLocal ? 0 : estimateCost(config.modelId, inputTokens, outputTokens),
            usageSource: reported.outputTokens !== undefined ? "provider" : "estimated",
            provider: config.provider,
            isLocal,
        };
    };

    try {
        for await (const evt of provider.stream(messages, config, apiKey, signal)) {
            if (signal?.aborted) throw abortedError(provider.id);
            if (evt.type === "token") {
                if (firstTokenAt === null) firstTokenAt = clock();
                content += evt.text;
                onProgress({ content, telemetry: telemetryNow() });
            } else {
                Object.assign(reported, evt.usage);
            }
        }
    } catch (err) {
        if (err instanceof LLMError) throw err;
        if (isAbortError(err) || signal?.aborted) throw abortedError(provider.id, err);
        throw new LLMError({ code: "unknown", provider: provider.id, message: `${provider.name}: ${(err as Error)?.message ?? String(err)}`, cause: err });
    }

    const telemetry = telemetryNow();
    // Final progress tick so the UI shows provider-reported usage, which usually arrives after the last token.
    onProgress({ content, telemetry });
    return { content, telemetry };
}
