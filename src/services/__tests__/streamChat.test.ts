import { describe, it, expect, vi } from "vitest";
import type { LLMStreamEvent, Message } from "@/types/llm";
import { streamChat, PROVIDERS } from "../llm";
import { estimateCost } from "../models";
import { LLMError } from "../llm-core";

const MESSAGES: Message[] = [{ id: "1", role: "user", content: "x".repeat(400), timestamp: 0 }]; // ≈100 tokens

/** Deterministic clock: each call advances by `step` ms. */
function fakeClock(step = 100) {
    let t = 0;
    return () => (t += step);
}

function fakeStream(events: LLMStreamEvent[], opts: { throwAfter?: Error } = {}) {
    return async function* () {
        for (const e of events) yield e;
        if (opts.throwAfter) throw opts.throwAfter;
    };
}

describe("streamChat accounting", () => {
    it("prefers provider-reported usage and prices it with the model table", async () => {
        vi.spyOn(PROVIDERS.openai, "stream").mockImplementation(fakeStream([
            { type: "token", text: "Hello" },
            { type: "token", text: " world" },
            { type: "usage", usage: { inputTokens: 1200 } },
            { type: "usage", usage: { outputTokens: 800 } },
        ]));
        const progress = vi.fn();
        const result = await streamChat(MESSAGES, { provider: "openai", modelId: "gpt-6-luna" }, "sk", progress, undefined, fakeClock());

        expect(result.content).toBe("Hello world");
        expect(result.telemetry).toMatchObject({
            inputTokens: 1200,
            tokens: 800,
            usageSource: "provider",
            isLocal: false,
            cost: estimateCost("gpt-6-luna", 1200, 800),
        });
        expect(result.telemetry.cost).toBeGreaterThan(0);
        // last progress tick carries the final usage that arrived after the last token
        expect(progress.mock.calls.at(-1)![0].telemetry.tokens).toBe(800);
    });

    it("falls back to the chars/4 estimate and flags it", async () => {
        vi.spyOn(PROVIDERS.lmstudio, "stream").mockImplementation(fakeStream([{ type: "token", text: "a".repeat(40) }]));
        const result = await streamChat(MESSAGES, { provider: "lmstudio", modelId: "local-model" }, "", vi.fn(), undefined, fakeClock());
        expect(result.telemetry).toMatchObject({ tokens: 10, inputTokens: 100, usageSource: "estimated", cost: 0, isLocal: true });
    });

    it("reports TTFT separately and computes tok/s over decode time only", async () => {
        vi.spyOn(PROVIDERS.ollama, "stream").mockImplementation(fakeStream([
            { type: "token", text: "a" },
            { type: "token", text: "b" },
            { type: "usage", usage: { outputTokens: 20 } },
        ]));
        // clock calls: start=100, first token=200, progress#1=300, progress#2=400, final=500
        const result = await streamChat(MESSAGES, { provider: "ollama", modelId: "llama3.2" }, "", vi.fn(), undefined, fakeClock());
        expect(result.telemetry.ttftMs).toBe(100);
        expect(result.telemetry.durationMs).toBe(400);
        // 20 tokens over 300 ms of decode (200 → 500)
        expect(result.telemetry.tokPerSec).toBeCloseTo(66.7, 1);
    });

    it("local providers never accrue cost", async () => {
        vi.spyOn(PROVIDERS.webllm, "stream").mockImplementation(fakeStream([
            { type: "token", text: "hi" }, { type: "usage", usage: { inputTokens: 5000, outputTokens: 5000 } },
        ]));
        const result = await streamChat(MESSAGES, { provider: "webllm", modelId: "gpt-4o" }, "", vi.fn(), undefined, fakeClock());
        expect(result.telemetry.cost).toBe(0);
    });

    it("wraps unexpected errors in LLMError and passes LLMErrors through", async () => {
        vi.spyOn(PROVIDERS.openai, "stream").mockImplementation(fakeStream([{ type: "token", text: "x" }], { throwAfter: new RangeError("boom") }));
        await expect(streamChat(MESSAGES, { provider: "openai", modelId: "gpt-4o" }, "sk", vi.fn())).rejects.toMatchObject({ code: "unknown", provider: "openai" });

        const rate = new LLMError({ code: "rate_limit", provider: "openai", message: "slow down" });
        vi.spyOn(PROVIDERS.openai, "stream").mockImplementation(fakeStream([], { throwAfter: rate }));
        await expect(streamChat(MESSAGES, { provider: "openai", modelId: "gpt-4o" }, "sk", vi.fn())).rejects.toBe(rate);
    });

    it("stops and throws an abort error once the signal fires", async () => {
        const ctrl = new AbortController();
        vi.spyOn(PROVIDERS.openai, "stream").mockImplementation(async function* () {
            yield { type: "token", text: "a" };
            ctrl.abort();
            yield { type: "token", text: "b" };
            yield { type: "token", text: "c" };
        });
        const progress = vi.fn();
        await expect(streamChat(MESSAGES, { provider: "openai", modelId: "gpt-4o" }, "sk", progress, ctrl.signal))
            .rejects.toMatchObject({ code: "aborted", name: "AbortError" });
        expect(progress).toHaveBeenCalledTimes(1);
    });

    it("rejects unknown providers", async () => {
        await expect(streamChat(MESSAGES, { provider: "nope" as never, modelId: "x" }, "", vi.fn())).rejects.toMatchObject({ code: "unsupported" });
    });
});
