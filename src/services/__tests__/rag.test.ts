import { describe, it, expect } from "vitest";
import { chunkDocument, searchRelevantChunks, selectContextChunks, formatRAGContext, type DocumentChunk } from "../rag";

const words = (n: number, w = "lorem") => Array.from({ length: n }, (_, i) => `${w}${i}`).join(" ");

describe("chunkDocument", () => {
    it("returns nothing for empty / whitespace input", () => {
        expect(chunkDocument("", "a.txt")).toEqual([]);
        expect(chunkDocument("   \n  ", "a.txt")).toEqual([]);
    });

    it("keeps a short document as a single chunk", () => {
        const chunks = chunkDocument("A short but meaningful paragraph of text.", "a.txt");
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toMatchObject({ id: "a.txt-chunk-0", filename: "a.txt", index: 0, wordCount: 7 });
    });

    it("drops fragments of 20 characters or less", () => {
        expect(chunkDocument("tiny", "a.txt")).toEqual([]);
    });

    it("produces bounded, overlapping, sequentially indexed chunks that cover the text", () => {
        const text = words(400);
        const chunks = chunkDocument(text, "doc.md", 600, 120);

        expect(chunks.length).toBeGreaterThan(3);
        chunks.forEach((c, i) => {
            expect(c.index).toBe(i);
            expect(c.content.length).toBeLessThanOrEqual(600);
        });
        // consecutive chunks overlap
        for (let i = 1; i < chunks.length; i++) {
            const prevTail = chunks[i - 1].content.split(" ").slice(-3).join(" ");
            expect(chunks[i].content).toContain(prevTail.split(" ").at(-1)!);
        }
        // first and last words are both covered
        expect(chunks[0].content.startsWith("lorem0")).toBe(true);
        expect(chunks.at(-1)!.content.endsWith("lorem399")).toBe(true);
    });

    it("prefers breaking on whitespace instead of mid-word", () => {
        const chunks = chunkDocument(words(300, "alpha"), "a.txt", 100, 20);
        for (const c of chunks.slice(0, -1)) expect(c.content).toMatch(/alpha\d+$/);
    });

    it("normalises CRLF line endings", () => {
        const [c] = chunkDocument("line one is here\r\nline two is here", "a.txt");
        expect(c.content).not.toContain("\r");
    });
});

describe("searchRelevantChunks (TF-IDF cosine)", () => {
    const mk = (id: string, content: string): DocumentChunk => ({ id, filename: `${id}.md`, content, index: 0, wordCount: content.split(" ").length });
    const corpus = [
        mk("dr", "Disaster recovery runs from the Frankfurt region with hourly snapshots and a fifteen minute RPO."),
        mk("billing", "Invoices are generated monthly and billing disputes go to the finance team."),
        mk("auth", "Authentication uses passkeys with WebAuthn and falls back to TOTP codes."),
        mk("dr2", "The recovery runbook lists Frankfurt failover steps for the database cluster."),
    ];

    it("ranks the most relevant chunk first", () => {
        const [top] = searchRelevantChunks("Where does disaster recovery run?", corpus);
        expect(top.chunk.id).toBe("dr");
        expect(top.score).toBeGreaterThan(0);
        expect(top.score).toBeLessThanOrEqual(1);
    });

    it("returns results sorted by descending score and respects topK", () => {
        const results = searchRelevantChunks("Frankfurt recovery failover", corpus, 2);
        expect(results).toHaveLength(2);
        expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
        expect(new Set(results.map(r => r.chunk.id))).toEqual(new Set(["dr", "dr2"]));
    });

    it("weights rare terms above common ones (IDF)", () => {
        // "frankfurt" appears in 2 chunks, "passkeys" in 1: the rare term should dominate
        const [top] = searchRelevantChunks("frankfurt passkeys", corpus);
        expect(top.chunk.id).toBe("auth");
    });

    it("filters out unrelated chunks", () => {
        expect(searchRelevantChunks("quantum chromodynamics", corpus)).toEqual([]);
    });

    it("ignores punctuation, case and words of two letters or less", () => {
        const a = searchRelevantChunks("BILLING disputes?!", corpus);
        expect(a[0].chunk.id).toBe("billing");
        expect(searchRelevantChunks("is a to", corpus)).toEqual([]);
    });

    it("handles empty queries and empty corpora", () => {
        expect(searchRelevantChunks("", corpus)).toEqual([]);
        expect(searchRelevantChunks("recovery", [])).toEqual([]);
    });
});

describe("formatRAGContext", () => {
    it("labels each source with its relevance percentage", () => {
        const out = formatRAGContext([{ chunk: { id: "x", filename: "notes.md", content: "Body text", index: 0, wordCount: 2 }, score: 0.837 }]);
        expect(out).toContain("--- Source: notes.md (match 84%) ---");
        expect(out).toContain("Body text");
        expect(formatRAGContext([])).toBe("");
    });
});

describe("selectContextChunks", () => {
    const chunks = [
        ...chunkDocument(`Consulting agreement. ${words(150, "alpha")}`, "contract.txt"),
        ...chunkDocument(`Handbook. ${words(150, "beta")}`, "handbook.txt"),
    ];

    it("uses ranked matches when the question matches the documents", () => {
        const picked = selectContextChunks("consulting agreement", chunks, 2);
        expect(picked[0].chunk.filename).toBe("contract.txt");
        expect(picked[0].score).toBeGreaterThan(0);
    });

    it("falls back to the opening of every file when nothing matches (e.g. 'summarize this')", () => {
        const picked = selectContextChunks("summarize this please", chunks, 4);
        expect(picked.map(p => p.score)).toEqual([0, 0, 0, 0]);
        expect(picked.slice(0, 2).map(p => [p.chunk.filename, p.chunk.index])).toEqual([["contract.txt", 0], ["handbook.txt", 0]]);
        expect(formatRAGContext(picked)).toContain("opening of the document");
    });

    it("returns nothing when there are no chunks", () => {
        expect(selectContextChunks("anything", [], 4)).toEqual([]);
    });
});

describe("formatRAGContext wording", () => {
    it("states that excerpts are part of the request (no 'zero bytes transmitted' claim)", () => {
        const [c] = chunkDocument("The quarterly retainer is 4,750 euros payable quarterly.", "c.txt");
        const text = formatRAGContext([{ chunk: c, score: 0.9 }]);
        expect(text).toMatch(/only these excerpts are included in this request/);
        expect(text).not.toMatch(/zero bytes/i);
    });
});
