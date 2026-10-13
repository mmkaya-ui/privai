import { Message, ModelConfig, LLMProviderAdapter, MessageTelemetry } from "@/types/llm";

// Registry
import { OpenAIAdapter } from "./openai";
import { GroqAdapter } from "./groq";
import { DeepSeekAdapter } from "./deepseek";
import { AnthropicAdapter } from "./anthropic";
import { GeminiAdapter } from "./gemini";
import { OllamaAdapter, LMStudioAdapter } from "./ollama";
import { WebLLMAdapter } from "./webllm";

export const getAdapter = (providerId: string): LLMProviderAdapter => {
    switch (providerId) {
        case 'openai': return OpenAIAdapter;
        case 'groq': return GroqAdapter;
        case 'deepseek': return DeepSeekAdapter;
        case 'anthropic': return AnthropicAdapter;
        case 'gemini': return GeminiAdapter;
        case 'ollama': return OllamaAdapter;
        case 'lmstudio': return LMStudioAdapter;
        case 'webllm': return WebLLMAdapter;
        default: throw new Error(`Provider ${providerId} not implemented`);
    }
};

export interface StreamProgress {
    content: string;
    telemetry?: MessageTelemetry;
}

import { estimateCost } from "./models";

export async function streamChat(
    messages: Message[],
    config: ModelConfig,
    apiKey: string,
    onProgress: (progress: StreamProgress) => void,
    signal?: AbortSignal
) {
    const adapter = getAdapter(config.provider);
    const startTime = performance.now();
    const isLocal = config.provider === 'ollama' || config.provider === 'lmstudio' || config.provider === 'webllm';
    const inputChars = messages.reduce((acc, m) => acc + m.content.length, 0);
    const inputTokens = Math.max(Math.round(inputChars / 4), 1);

    const generator = await adapter.chat(messages, config, apiKey, signal);

    let fullContent = "";
    let chunkCount = 0;

    for await (const token of generator) {
        if (signal?.aborted) break;
        fullContent += token;
        chunkCount++;

        const elapsedSeconds = Math.max((performance.now() - startTime) / 1000, 0.05);
        // Approximate token count: chars / 4 as standard heuristic
        const estimatedTokens = Math.max(Math.round(fullContent.length / 4), chunkCount);
        const tokPerSec = Math.round((estimatedTokens / elapsedSeconds) * 10) / 10;
        const currentCost = isLocal ? 0 : estimateCost(config.modelId, inputTokens, estimatedTokens);

        onProgress({
            content: fullContent,
            telemetry: {
                tokens: estimatedTokens,
                tokPerSec,
                durationMs: Math.round(performance.now() - startTime),
                cost: currentCost,
                provider: config.provider,
                isLocal
            }
        });
    }

    const totalDuration = Math.round(performance.now() - startTime);
    const totalTokens = Math.max(Math.round(fullContent.length / 4), 1);
    const finalTokPerSec = Math.round((totalTokens / Math.max(totalDuration / 1000, 0.1)) * 10) / 10;
    const finalCost = isLocal ? 0 : estimateCost(config.modelId, inputTokens, totalTokens);

    return {
        content: fullContent,
        telemetry: {
            tokens: totalTokens,
            tokPerSec: finalTokPerSec,
            durationMs: totalDuration,
            cost: finalCost,
            provider: config.provider,
            isLocal
        }
    };
}
