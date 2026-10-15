import { describe, it, expect } from "vitest";
import { chunkDocument, searchRelevantChunks, formatRAGContext, parseDocument, type DocumentChunk } from "../rag";

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
        expect(out).toContain("--- Source: notes.md (Match Relevance: 84%) ---");
        expect(out).toContain("Body text");
        expect(formatRAGContext([])).toBe("");
    });
});

describe("parseDocument", () => {
    it("reads text-like files verbatim", async () => {
        const file = new File(["# Title\nbody"], "readme.md", { type: "text/markdown" });
        expect(await parseDocument(file)).toBe("# Title\nbody");
    });

    it("extracts printable runs from a PDF and falls back to a placeholder", async () => {
        const pdfLike = new File([new Uint8Array([0, 1, ...new TextEncoder().encode("Quarterly revenue grew strongly across Europe and Asia this year"), 0, 2])], "r.pdf");
        expect(await parseDocument(pdfLike)).toContain("Quarterly revenue grew strongly");
        const binary = new File([new Uint8Array(64)], "scan.pdf");
        expect(await parseDocument(binary)).toMatch(/^\[PDF Document: scan\.pdf/);
    });
});
