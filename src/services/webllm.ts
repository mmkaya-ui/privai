/**
 * PrivAI In-Browser WebGPU LLM Engine (WebLLM)
 * Runs models directly inside the browser tab using WebGPU.
 * Zero installation, zero servers, zero network packets sent after initial model weight cache.
 *
 * How it works: @mlc-ai/web-llm ships models compiled by MLC/TVM to WebGPU compute
 * shaders plus quantised weights (q4f16_1 = 4-bit weights, fp16 activations). On first
 * use the weights are downloaded from the model's Hugging Face repo and cached in the
 * browser's Cache Storage; afterwards inference is fully offline, on the user's GPU,
 * inside this tab. The engine exposes an OpenAI-style `chat.completions.create` API.
 */

import type { LLMProvider, LLMStreamEvent, Message, ModelConfig } from "@/types/llm";
import { LLMError, abortedError } from "./llm-core";

import type { MLCEngineInterface } from "@mlc-ai/web-llm";

export function isWebGPUSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(navigator as unknown as { gpu?: unknown }).gpu;
}

let engineInstance: MLCEngineInterface | null = null;
let currentLoadedModel: string | null = null;
let enginePromise: Promise<MLCEngineInterface> | null = null;

export async function getWebLLMEngine(
    modelId: string,
    onProgress?: (report: { text: string; progress: number }) => void
) {
    if (!isWebGPUSupported()) {
        throw new LLMError({
            code: "unsupported",
            provider: "webllm",
            message: "WebGPU is not supported on this browser or graphics card. Try Chrome/Edge with hardware acceleration enabled.",
        });
    }

    // De-duplicate concurrent loads (e.g. Arena running the same model twice). Checked first:
    // during a model switch `engineInstance` still points at the previous model.
    if (enginePromise && currentLoadedModel === modelId) return enginePromise;
    if (engineInstance && currentLoadedModel === modelId) return engineInstance;

    currentLoadedModel = modelId;
    enginePromise = (async () => {
        const webllm = await import("@mlc-ai/web-llm");
        if (engineInstance) await engineInstance.unload().catch(() => undefined);
        engineInstance = await webllm.CreateMLCEngine(modelId, {
            initProgressCallback: (report) => onProgress?.({ text: report.text, progress: report.progress }),
        });
        return engineInstance;
    })();

    try {
        return await enginePromise;
    } catch (err) {
        engineInstance = null;
        currentLoadedModel = null;
        throw new LLMError({
            code: "unsupported",
            provider: "webllm",
            message: `WebGPU (In-Browser): failed to load ${modelId} — ${(err as Error).message}`,
            cause: err,
        });
    } finally {
        enginePromise = null;
    }
}

/** Test hook: forget the cached engine. */
export function __resetWebLLMEngineForTests() {
    engineInstance = null;
    currentLoadedModel = null;
    enginePromise = null;
}

export const WebLLMProvider: LLMProvider = {
    id: "webllm",
    name: "WebGPU (In-Browser)",
    isLocal: true,
    requiresApiKey: false,

    async *stream(messages: Message[], config: ModelConfig, _apiKey: string, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent> {
        if (signal?.aborted) throw abortedError("webllm");
        const engine = await getWebLLMEngine(config.modelId);
        if (signal?.aborted) throw abortedError("webllm");

        // There is no socket to close: stop the GPU decode loop instead.
        const onAbort = () => engine.interruptGenerate();
        signal?.addEventListener("abort", onAbort, { once: true });

        try {
            const chunks = await engine.chat.completions.create({
                messages: messages.map(m => ({ role: m.role, content: m.content })) as never,
                temperature: config.temperature ?? 0.7,
                stream: true,
                stream_options: { include_usage: true },
            });

            for await (const chunk of chunks) {
                if (signal?.aborted) throw abortedError("webllm");
                const text = chunk.choices[0]?.delta?.content;
                if (text) yield { type: "token", text };
                if (chunk.usage) {
                    yield {
                        type: "usage",
                        usage: { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens },
                    };
                }
            }
            if (signal?.aborted) throw abortedError("webllm");
        } catch (err) {
            if (err instanceof LLMError) throw err;
            if (signal?.aborted) throw abortedError("webllm", err);
            throw new LLMError({ code: "unknown", provider: "webllm", message: `WebGPU (In-Browser): ${(err as Error).message}`, cause: err });
        } finally {
            signal?.removeEventListener("abort", onAbort);
        }
    },
};
