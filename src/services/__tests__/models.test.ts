import { describe, it, expect } from "vitest";
import { AVAILABLE_MODELS, PRICING_SOURCES, estimateCost, formatCost, getAvailableModels } from "../models";

describe("model catalog", () => {
    const cloud = AVAILABLE_MODELS.filter(m => !m.isLocal);

    it("has unique ids per provider", () => {
        const keys = AVAILABLE_MODELS.map(m => `${m.providerId}:${m.id}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("prices every paid cloud model and documents where the price came from", () => {
        for (const m of cloud) {
            expect(m.costPer1kInput, m.id).toBeGreaterThan(0);
            expect(m.costPer1kOutput, m.id).toBeGreaterThan(0);
            const src = PRICING_SOURCES[m.providerId as keyof typeof PRICING_SOURCES];
            expect(src, `${m.providerId} needs a PRICING_SOURCES entry`).toBeDefined();
            expect(src.url).toMatch(/^https:\/\//);
            expect(src.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(src.verified, `${m.providerId} prices must be checked against the official page`).toBe(true);
        }
    });

    it("never charges for local models", () => {
        for (const m of AVAILABLE_MODELS.filter(x => x.isLocal)) {
            expect(estimateCost(m.id, 1_000_000, 1_000_000)).toBe(0);
        }
    });

    it("computes cost from per-1K prices", () => {
        // Claude Sonnet 5.5: $2 / $10 per 1M → 1M in + 1M out = $12
        expect(estimateCost("claude-sonnet-5-5", 1_000_000, 1_000_000)).toBeCloseTo(12, 6);
        // small requests keep sub-cent precision
        expect(estimateCost("gpt-6-luna", 500, 200)).toBeCloseTo(0.00015, 7);
        expect(estimateCost("unknown-model", 1000, 1000)).toBe(0);
    });

    it("hides cloud models until a key is configured", () => {
        const none = getAvailableModels({});
        expect(none.every(m => m.isLocal)).toBe(true);
        const withAnthropic = getAvailableModels({ anthropic: "sk-ant" });
        expect(withAnthropic.some(m => m.providerId === "anthropic")).toBe(true);
        expect(withAnthropic.some(m => m.providerId === "openai")).toBe(false);
    });
});

describe("formatCost", () => {
    it("never shows a non-zero cost as $0.0000", () => {
        // 420 in + 21 out on GPT-OSS 20B (Groq) = $0.0000378
        expect(formatCost(estimateCost("openai/gpt-oss-20b", 420, 21))).toBe("<$0.0001");
        expect(formatCost(0.01234)).toBe("$0.0123");
        expect(formatCost(12.345)).toBe("$12.35");
        expect(formatCost(0)).toBe("$0");
    });
});

describe("discovered Ollama models", () => {
    it("are listed as free local models", () => {
        const list = getAvailableModels({}, ["qwen3:8b"]);
        expect(list[0]).toMatchObject({ id: "qwen3:8b", providerId: "ollama", isLocal: true, isFree: true });
        expect(getAvailableModels({}, ["llama3.2"]).filter(m => m.id === "llama3.2")).toHaveLength(1);
    });
});
