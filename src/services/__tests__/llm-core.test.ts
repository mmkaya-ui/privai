import { describe, it, expect } from "vitest";
import { readLines, readSSE, readNDJSON, codeForStatus, extractProviderMessage, LLMError, isAbortError } from "../llm-core";
import { chunkedStream } from "./helpers";

const enc = (s: string) => new TextEncoder().encode(s);
const streamOf = (...parts: (string | Uint8Array)[]) => chunkedStream(parts.map(p => (typeof p === "string" ? enc(p) : p))).stream;

async function all<T>(gen: AsyncGenerator<T>) {
    const out: T[] = [];
    for await (const x of gen) out.push(x);
    return out;
}

describe("readLines", () => {
    it("handles \\n, \\r\\n and lone \\r, including a CRLF split across chunks", async () => {
        expect(await all(readLines(streamOf("a\r", "\nb\rc\n", "d\r\n", "e")))).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("does not emit a phantom empty line when \\r and \\n arrive in separate chunks", async () => {
        expect(await all(readLines(streamOf("x\r", "\n", "y\n")))).toEqual(["x", "y"]);
    });

    it("reassembles a multi-byte character split between chunks", async () => {
        const bytes = enc("🌍\n");
        expect(await all(readLines(streamOf(bytes.slice(0, 1), bytes.slice(1, 3), bytes.slice(3))))).toEqual(["🌍"]);
    });
});

describe("readSSE", () => {
    it("joins multi-line data fields and keeps event names", async () => {
        const events = await all(readSSE(streamOf("event: delta\ndata: line1\ndata: line2\n\n")));
        expect(events).toEqual([{ event: "delta", data: "line1\nline2" }]);
    });

    it("ignores comments, keeps data without the optional space, and flushes a final unterminated event", async () => {
        const events = await all(readSSE(streamOf(": ping\n\ndata:{\"a\":1}\n\ndata: tail")));
        expect(events.map(e => e.data)).toEqual(['{"a":1}', "tail"]);
    });

    it("never hands JSON split mid-object to the consumer", async () => {
        const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: "split me" } }] })}\n\n`;
        const parts = payload.match(/[\s\S]{1,3}/g)!;
        const events = await all(readSSE(streamOf(...parts)));
        expect(events).toHaveLength(1);
        expect(JSON.parse(events[0].data).choices[0].delta.content).toBe("split me");
    });
});

describe("readNDJSON", () => {
    it("parses objects split across chunks and skips junk lines", async () => {
        const out = await all(readNDJSON(streamOf('{"a":', '1}\nnot json\n{"b":2}')));
        expect(out).toEqual([{ a: 1 }, { b: 2 }]);
    });
});

describe("error helpers", () => {
    it.each([[401, "auth"], [403, "auth"], [429, "rate_limit"], [404, "not_found"], [400, "bad_request"], [422, "bad_request"], [500, "server"], [529, "server"], [418, "unknown"]] as const)(
        "HTTP %i → %s", (status, code) => expect(codeForStatus(status)).toBe(code)
    );

    it("extracts messages from every provider envelope", () => {
        expect(extractProviderMessage({ error: { message: "openai style" } })).toBe("openai style");
        expect(extractProviderMessage({ error: "ollama style" })).toBe("ollama style");
        expect(extractProviderMessage({ message: "plain" })).toBe("plain");
        expect(extractProviderMessage("raw text body")).toBe("raw text body");
        expect(extractProviderMessage(undefined)).toBeUndefined();
    });

    it("aborted LLMErrors look like AbortError to existing checks", () => {
        const e = new LLMError({ code: "aborted", provider: "openai", message: "stopped" });
        expect(e.name).toBe("AbortError");
        expect(isAbortError(e)).toBe(true);
        expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
        expect(isAbortError(new Error("x"))).toBe(false);
    });
});
