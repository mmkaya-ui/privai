import { describe, it, expect } from "vitest";
import { AVAILABLE_MODELS, PRICING_SOURCES, estimateCost, getAvailableModels } from "../models";

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
