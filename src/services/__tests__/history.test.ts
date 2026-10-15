import { describe, it, expect } from "vitest";
import { buildPromptHistory, isNonConversationalTurn } from "../history";
import type { Message } from "@/types/llm";

let n = 0;
const msg = (role: Message["role"], content: string, extra: Partial<Message> = {}): Message =>
    ({ id: `m${n++}`, role, content, timestamp: 0, ...extra });

describe("buildPromptHistory", () => {
    it("drops error turns, notices and empty turns (incl. shapes stored by older builds)", () => {
        const out = buildPromptHistory([
            msg("user", "q1"),
            msg("assistant", "**Error**: Groq: invalid or missing API key (HTTP 401)"),       // legacy error
            msg("user", "q2"),
            msg("assistant", ""),                                                               // stopped before first token
            msg("assistant", "⚠️ **You are offline.** ...", { model: "system" }),              // legacy offline notice
            msg("user", "q3"),
            msg("assistant", "rate limited", { status: "error" }),
            msg("assistant", "_Stopped before the model replied._", { status: "notice" }),
            msg("user", "q4"),
        ]);
        expect(out.map(m => [m.role, m.content])).toEqual([["user", "q1\n\nq2\n\nq3\n\nq4"]]);
    });

    it("keeps partial replies the user stopped, and normal alternation", () => {
        const out = buildPromptHistory([msg("user", "a"), msg("assistant", "partial", { status: "stopped" }), msg("user", "b")]);
        expect(out.map(m => m.content)).toEqual(["a", "partial", "b"]);
    });

    it("limits to the last N turns and never starts with an assistant turn", () => {
        const many = Array.from({ length: 12 }, (_, i) => msg(i % 2 ? "assistant" : "user", `t${i}`));
        const out = buildPromptHistory(many, 4);
        expect(out.map(m => m.content)).toEqual(["t8", "t9", "t10", "t11"]);
        const odd = buildPromptHistory(many, 3);
        expect(odd[0].role).toBe("user");
        expect(odd.map(m => m.content)).toEqual(["t10", "t11"]);
    });

    it("keeps system messages first", () => {
        const out = buildPromptHistory([msg("user", "hi"), msg("system", "be brief")]);
        expect(out.map(m => m.role)).toEqual(["system", "user"]);
    });

    it("identifies non-conversational turns", () => {
        expect(isNonConversationalTurn(msg("assistant", "fine"))).toBe(false);
        expect(isNonConversationalTurn(msg("user", "**Error**: typed by user"))).toBe(false);
    });
});
