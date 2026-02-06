import { Message, ModelConfig, LLMProviderAdapter } from "@/types/llm";

export interface LLMResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
    }
}


// Registry
import { OpenAIAdapter } from "./openai";
import { GroqAdapter } from "./groq";
import { DeepSeekAdapter } from "./deepseek";
import { AnthropicAdapter } from "./anthropic";
import { GeminiAdapter } from "./gemini";

export const getAdapter = (providerId: string): LLMProviderAdapter => {
    switch (providerId) {
        case 'openai': return OpenAIAdapter;
        case 'groq': return GroqAdapter;
        case 'deepseek': return DeepSeekAdapter;
        case 'anthropic': return AnthropicAdapter;
        case 'gemini': return GeminiAdapter;
        default: throw new Error(`Provider ${providerId} not implemented`);
    }
}

export async function streamChat(
    messages: Message[],
    config: ModelConfig,
    apiKey: string,
    onToken: (token: string) => void,
    signal?: AbortSignal
) {
    const adapter = getAdapter(config.provider);
    const generator = await adapter.chat(messages, config, apiKey, signal);

    let fullContent = "";
    for await (const token of generator) {
        if (signal?.aborted) break;
        fullContent += token;
        onToken(fullContent);
    }
    return fullContent;
}
