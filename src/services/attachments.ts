/**
 * Turn an attached file into plain text for local retrieval (src/services/rag.ts).
 *
 * Everything runs in the browser tab. Supported:
 *  - plain text / code / markdown / csv / json (and any other file that decodes as text),
 *  - PDF with a text layer (pdf.js; handles compressed streams, fonts, encodings),
 *  - DOCX (unzip + WordprocessingML text runs).
 * Not supported, reported back to the user instead of guessed at:
 *  - images (no vision support yet), scanned PDFs without a text layer, other binary formats.
 */
import { unzipSync, strFromU8 } from "fflate";

export type ExtractedAttachment =
    | { ok: true; text: string; kind: "text" | "pdf" | "docx" }
    | { ok: false; reason: string };

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif", "tif", "tiff", "avif", "ico"]);
const KNOWN_BINARY_EXT = new Set([
    "doc", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "zip", "gz", "tar", "7z", "rar",
    "mp3", "wav", "m4a", "mp4", "mov", "avi", "mkv", "exe", "dll", "bin", "dmg", "iso", "woff", "woff2", "ttf", "otf",
]);

export function extensionOf(name: string): string {
    const i = name.lastIndexOf(".");
    return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/** Heuristic: NUL bytes or many invalid UTF-8 sequences in the first 8 KiB mean "binary". */
export function looksBinary(bytes: Uint8Array): boolean {
    const sample = bytes.subarray(0, 8192);
    if (sample.includes(0)) return true;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(sample);
    if (!text) return false;
    let bad = 0;
    for (const ch of text) if (ch === "�") bad++;
    return bad / text.length > 0.02;
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeXmlEntities(s: string): string {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
        if (e[0] !== "#") return XML_ENTITIES[e];
        const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return String.fromCodePoint(code);
    });
}

/** Extract body text from a .docx (Office Open XML). Paragraphs become lines. */
export function extractDocxText(bytes: Uint8Array): string {
    const files = unzipSync(bytes, { filter: f => f.name === "word/document.xml" });
    const xml = files["word/document.xml"];
    if (!xml) throw new Error("not a Word document (word/document.xml missing)");
    const doc = strFromU8(xml);
    // Walk the text runs, tabs and breaks of each paragraph in document order.
    const token = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>/g;
    const lines = doc.split(/<\/w:p>/).map(paragraph => {
        let line = "";
        for (const m of paragraph.matchAll(token)) {
            if (m[1] !== undefined) line += decodeXmlEntities(m[1]);
            else line += m[0].startsWith("<w:tab") ? "\t" : "\n";
        }
        return line;
    });
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

type PdfJs = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfJs> | null = null;
/** Load pdf.js once. In the browser its worker is bundled from node_modules, not fetched from a CDN. */
function loadPdfJs(): Promise<PdfJs> {
    if (!pdfjsPromise) {
        pdfjsPromise = (import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJs>).then(pdfjs => {
            if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
                pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
            }
            return pdfjs;
        });
    }
    return pdfjsPromise;
}

/** Extract the text layer of a PDF, page by page. Returns "" for image-only (scanned) PDFs. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
    const pdfjs = await loadPdfJs();
    // pdf.js takes ownership of the buffer; give it a copy so the caller's bytes stay usable.
    const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false }).promise;
    try {
        const pages: string[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
            const page = await doc.getPage(n);
            const content = await page.getTextContent();
            let line = "";
            const lines: string[] = [];
            for (const item of content.items) {
                if (!("str" in item)) continue;
                line += item.str;
                if (item.hasEOL) {
                    lines.push(line);
                    line = "";
                }
            }
            if (line) lines.push(line);
            pages.push(lines.join("\n"));
            page.cleanup();
        }
        return pages.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    } finally {
        await doc.destroy();
    }
}

async function fileBytes(file: Blob): Promise<Uint8Array> {
    return new Uint8Array(await file.arrayBuffer());
}

export async function extractAttachmentText(file: File): Promise<ExtractedAttachment> {
    const ext = extensionOf(file.name);
    const mime = (file.type || "").toLowerCase();

    if (mime.startsWith("image/") || IMAGE_EXT.has(ext)) {
        return { ok: false, reason: "images are not sent to models (no vision support yet)" };
    }

    const bytes = await fileBytes(file);

    if (ext === "pdf" || mime === "application/pdf") {
        try {
            const text = await extractPdfText(bytes);
            return text ? { ok: true, text, kind: "pdf" } : { ok: false, reason: "no text layer found (scanned PDF?)" };
        } catch (e) {
            return { ok: false, reason: `could not read PDF: ${(e as Error).message}` };
        }
    }

    if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        try {
            const text = extractDocxText(bytes);
            return text ? { ok: true, text, kind: "docx" } : { ok: false, reason: "the document contains no text" };
        } catch (e) {
            return { ok: false, reason: `could not read DOCX: ${(e as Error).message}` };
        }
    }

    if (KNOWN_BINARY_EXT.has(ext) || looksBinary(bytes)) {
        return { ok: false, reason: `.${ext || "binary"} files are not supported` };
    }

    const text = new TextDecoder("utf-8").decode(bytes).trim();
    return text ? { ok: true, text, kind: "text" } : { ok: false, reason: "the file is empty" };
}
