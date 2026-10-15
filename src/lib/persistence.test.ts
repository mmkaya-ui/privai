import { describe, it, expect } from "vitest";
import { sessionsNeedingSave } from "./persistence";
import type { ChatSession } from "@/types/llm";

const session = (id: string): ChatSession =>
    ({ id, title: id, messages: [], createdAt: 0, updatedAt: 0, modelConfig: { provider: "groq", modelId: "m" } });

describe("sessionsNeedingSave", () => {
    it("returns every changed chat, not just the one on screen", () => {
        const a = session("a"), b = session("b");
        const saved = new Map([["a", a], ["b", b]]);
        const aAfterReply = { ...a, messages: [{ id: "r", role: "assistant" as const, content: "reply", timestamp: 1 }] };
        expect(sessionsNeedingSave([aAfterReply, b], saved)).toEqual([aAfterReply]);
    });

    it("includes chats never saved and skips unchanged ones", () => {
        const a = session("a");
        expect(sessionsNeedingSave([a, session("new")], new Map([["a", a]])).map(s => s.id)).toEqual(["new"]);
    });
});
