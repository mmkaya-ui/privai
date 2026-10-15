import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { extractAttachmentText, extractDocxText, looksBinary } from "../attachments";

// Real files produced by LibreOffice 7 / Pillow (see docs/VERIFICATION.md for how they were made).
const fixture = (name: string, type: string) =>
    new File([fs.readFileSync(path.join(__dirname, "fixtures", name))], name, { type });

describe("extractAttachmentText — real files", () => {
    it("PDF: extracts text from compressed (FlateDecode) content streams", async () => {
        const raw = fs.readFileSync(path.join(__dirname, "fixtures", "contract.pdf"));
        // Precondition that made the old byte-scanner useless: the text is not in the raw bytes.
        expect(raw.includes(Buffer.from("4,750"))).toBe(false);
        expect(raw.includes(Buffer.from("FlateDecode"))).toBe(true);

        const r = await extractAttachmentText(fixture("contract.pdf", "application/pdf"));
        expect(r).toMatchObject({ ok: true, kind: "pdf" });
        if (r.ok) {
            expect(r.text).toContain("The quarterly retainer is 4,750 euros");
            expect(r.text).toContain("sixty days written notice");
            expect(r.text).not.toMatch(/FlateDecode|endobj|\/Type/);
        }
    });

    it("DOCX: extracts paragraph text", async () => {
        const r = await extractAttachmentText(fixture("handbook.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
        expect(r).toMatchObject({ ok: true, kind: "docx" });
        if (r.ok) {
            expect(r.text).toContain("Staff may work remotely up to three days per week");
            expect(r.text.split("\n").length).toBeGreaterThan(3);
        }
    });

    it("PNG: refuses instead of producing binary text", async () => {
        const r = await extractAttachmentText(fixture("photo.png", "image/png"));
        expect(r).toEqual({ ok: false, reason: expect.stringMatching(/images are not sent/) });
    });
});

describe("extractAttachmentText — edge cases", () => {
    it("reads text-like files verbatim", async () => {
        const r = await extractAttachmentText(new File(["# Title\nbody"], "readme.md", { type: "text/markdown" }));
        expect(r).toEqual({ ok: true, kind: "text", text: "# Title\nbody" });
    });

    it("treats unknown extensions as text only when they decode as text", async () => {
        expect(await extractAttachmentText(new File(["key = value"], "app.conf"))).toMatchObject({ ok: true });
        expect(await extractAttachmentText(new File([new Uint8Array([1, 0, 2, 0, 3])], "blob.dat"))).toMatchObject({ ok: false });
    });

    it("rejects known binary office formats it cannot read", async () => {
        expect(await extractAttachmentText(new File(["PK..."], "sheet.xlsx"))).toEqual({ ok: false, reason: ".xlsx files are not supported" });
    });

    it("reports a PDF without a text layer instead of inventing text", async () => {
        const r = await extractAttachmentText(new File([new Uint8Array(64)], "scan.pdf", { type: "application/pdf" }));
        expect(r.ok).toBe(false);
    });

    it("reports empty files", async () => {
        expect(await extractAttachmentText(new File([""], "empty.txt"))).toEqual({ ok: false, reason: "the file is empty" });
    });
});

describe("extractDocxText", () => {
    const docx = (body: string) =>
        zipSync({ "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`) });

    it("joins runs, keeps tabs and breaks, decodes entities", () => {
        const text = extractDocxText(docx(
            `<w:p><w:r><w:t>Fish &amp; chips</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve"> £5</w:t></w:r></w:p>` +
            `<w:p><w:r><w:t>line one</w:t><w:br/><w:t>line two &#x2013; end</w:t></w:r></w:p>`
        ));
        expect(text).toBe("Fish & chips\t £5\nline one\nline two – end");
    });

    it("throws for zips that are not Word documents", () => {
        expect(() => extractDocxText(zipSync({ "a.txt": strToU8("x") }))).toThrow(/not a Word document/);
    });
});

describe("looksBinary", () => {
    it("flags NUL bytes and invalid UTF-8, accepts normal text", () => {
        expect(looksBinary(new Uint8Array([72, 0, 73]))).toBe(true);
        expect(looksBinary(new Uint8Array(Array(200).fill(0xff)))).toBe(true);
        expect(looksBinary(new TextEncoder().encode("héllo wörld, ünïcode is fine"))).toBe(false);
    });
});
