import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Message } from "@/types/llm";

// Fake MLC engine: streams a few chunks, honours interruptGenerate() like the real one.
const engine = {
    interrupted: false,
    interruptGenerate: vi.fn(function (this: { interrupted: boolean }) { engine.interrupted = true; }),
    unload: vi.fn(async () => undefined),
    chat: {
        completions: {
            create: vi.fn(async () => (async function* () {
                const parts = ["In", "-browser", " hi"];
                for (const p of parts) {
                    if (engine.interrupted) return;
                    await new Promise(r => setTimeout(r, 5));
                    yield { choices: [{ delta: { content: p } }] };
                }
                yield { choices: [], usage: { prompt_tokens: 9, completion_tokens: 3 } };
            })()),
        },
    },
};
const CreateMLCEngine = vi.fn(async () => engine);
vi.mock("@mlc-ai/web-llm", () => ({ CreateMLCEngine }));

const { WebLLMProvider, __resetWebLLMEngineForTests } = await import("../webllm");
const MESSAGES: Message[] = [{ id: "1", role: "user", content: "hi", timestamp: 0 }];
const CONFIG = { provider: "webllm" as const, modelId: "Llama-3.2-1B-Instruct-q4f16_1-MLC" };

describe("WebLLM provider", () => {
    beforeEach(() => {
        __resetWebLLMEngineForTests();
        engine.interrupted = false;
        vi.stubGlobal("window", {});
        vi.stubGlobal("navigator", { gpu: {} });
    });

    it("streams tokens and usage from the in-tab engine", async () => {
        const events = [];
        for await (const e of WebLLMProvider.stream(MESSAGES, CONFIG, "")) events.push(e);
        expect(events).toEqual([
            { type: "token", text: "In" },
            { type: "token", text: "-browser" },
            { type: "token", text: " hi" },
            { type: "usage", usage: { inputTokens: 9, outputTokens: 3 } },
        ]);
        expect(engine.chat.completions.create).toHaveBeenCalledWith(expect.objectContaining({ stream: true, stream_options: { include_usage: true } }));
    });

    it("loads the model once and reuses the engine", async () => {
        for await (const _ of WebLLMProvider.stream(MESSAGES, CONFIG, "")) { /* drain */ }
        for await (const _ of WebLLMProvider.stream(MESSAGES, CONFIG, "")) { /* drain */ }
        expect(CreateMLCEngine).toHaveBeenCalledTimes(1);
    });

    it("abort interrupts GPU generation and throws an aborted LLMError", async () => {
        const ctrl = new AbortController();
        const gen = WebLLMProvider.stream(MESSAGES, CONFIG, "", ctrl.signal);
        expect((await gen.next()).value).toEqual({ type: "token", text: "In" });
        ctrl.abort();
        await expect(gen.next()).rejects.toMatchObject({ code: "aborted", name: "AbortError" });
        expect(engine.interruptGenerate).toHaveBeenCalled();
    });

    it("reports 'unsupported' when WebGPU is unavailable", async () => {
        vi.stubGlobal("navigator", {});
        const gen = WebLLMProvider.stream(MESSAGES, CONFIG, "");
        await expect(gen.next()).rejects.toMatchObject({ code: "unsupported", provider: "webllm" });
    });
});
