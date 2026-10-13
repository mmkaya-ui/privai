/**
 * PrivAI In-Browser WebGPU LLM Engine (WebLLM)
 * Runs models directly inside the browser tab using WebGPU.
 * Zero installation, zero servers, zero network packets sent after initial model weight cache.
 */

import { LLMProviderAdapter, Message, ModelConfig } from "@/types/llm";

import type { MLCEngineInterface } from "@mlc-ai/web-llm";

export function isWebGPUSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(navigator as unknown as { gpu?: unknown }).gpu;
}

let engineInstance: MLCEngineInterface | null = null;
let currentLoadedModel: string | null = null;

export async function getWebLLMEngine(
    modelId: string,
    onProgress?: (report: { text: string; progress: number }) => void
) {
    if (!isWebGPUSupported()) {
        throw new Error("WebGPU is not supported on this browser or graphics card. Try Chrome/Edge with hardware acceleration enabled.");
    }

    const webllm = await import("@mlc-ai/web-llm");

    if (!engineInstance || currentLoadedModel !== modelId) {
        engineInstance = await webllm.CreateMLCEngine(
            modelId,
            {
                initProgressCallback: (report) => {
                    if (onProgress) {
                        onProgress({ text: report.text, progress: report.progress });
                    }
                }
            }
        );
        currentLoadedModel = modelId;
    }

    return engineInstance;
}

export const WebLLMAdapter: LLMProviderAdapter = {
    id: 'webllm',
    name: 'WebGPU (In-Browser)',

    async chat(messages: Message[], config: ModelConfig, apiKey?: string, signal?: AbortSignal) {
        if (!isWebGPUSupported()) {
            throw new Error("WebGPU is not available in your browser. Please use Chrome/Edge or select Local Ollama / Cloud models.");
        }

        const engine = await getWebLLMEngine(config.modelId);

        const chatMessages = messages.map(m => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content
        }));

        const asyncChunkGenerator = await engine.chat.completions.create({
            messages: chatMessages,
            temperature: config.temperature ?? 0.7,
            stream: true
        });

        return (async function* () {
            for await (const chunk of asyncChunkGenerator) {
                if (signal?.aborted) break;
                const token = chunk.choices[0]?.delta?.content || "";
                if (token) yield token;
            }
        })();
    }
};
