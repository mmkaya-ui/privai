/**
 * In-browser retrieval over attached documents.
 *
 * Text extraction lives in ./attachments.ts. Here the text is split into overlapping chunks and
 * ranked against the question with TF-IDF + cosine similarity, all in memory (no embeddings model,
 * nothing persisted). Whole files are never sent anywhere; the top-ranked excerpts are added to the
 * prompt, so they DO go to whichever model the user is chatting with (a cloud provider or a local one).
 */

export interface DocumentChunk {
    id: string;
    filename: string;
    content: string;
    index: number;
    wordCount: number;
}

export interface ScoredChunk {
    chunk: DocumentChunk;
    score: number; // 0 to 1
}

/**
 * Splits document text into overlapping chunks
 */
export function chunkDocument(
    text: string,
    filename: string,
    chunkSize = 600,
    overlap = 120
): DocumentChunk[] {
    const cleanText = text.replace(/\r\n/g, '\n').trim();
    if (!cleanText) return [];

    const chunks: DocumentChunk[] = [];
    let start = 0;
    let index = 0;

    while (start < cleanText.length) {
        let end = start + chunkSize;
        // Avoid splitting in the middle of a word if possible
        if (end < cleanText.length) {
            const nextSpace = cleanText.lastIndexOf(' ', end);
            if (nextSpace > start + chunkSize * 0.6) {
                end = nextSpace;
            }
        }

        const chunkContent = cleanText.substring(start, end).trim();
        if (chunkContent.length > 20) {
            chunks.push({
                id: `${filename}-chunk-${index}`,
                filename,
                content: chunkContent,
                index,
                wordCount: chunkContent.split(/\s+/).length
            });
            index++;
        }

        start = end - overlap;
        if (start >= cleanText.length || end >= cleanText.length) break;
    }

    return chunks;
}

// Tokenize text into normalized lowercase terms
function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2);
}

/**
 * TF-IDF cosine-similarity ranking of chunks against a query (sparse vectors built on the fly).
 */
export function searchRelevantChunks(
    query: string,
    chunks: DocumentChunk[],
    topK = 4
): ScoredChunk[] {
    if (!query.trim() || chunks.length === 0) return [];

    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    // 1. Calculate Document Frequencies (DF)
    const df: Record<string, number> = {};
    const chunkTokensMap: Map<string, string[]> = new Map();

    chunks.forEach(c => {
        const terms = tokenize(c.content);
        chunkTokensMap.set(c.id, terms);
        const uniqueTerms = new Set(terms);
        uniqueTerms.forEach(term => {
            df[term] = (df[term] || 0) + 1;
        });
    });

    const totalDocs = chunks.length;

    // 2. Query Term Frequency & Weights
    const queryTf: Record<string, number> = {};
    queryTerms.forEach(term => {
        queryTf[term] = (queryTf[term] || 0) + 1;
    });

    // 3. Score each chunk using Cosine Similarity over TF-IDF vectors
    const scored: ScoredChunk[] = chunks.map(chunk => {
        const tokens = chunkTokensMap.get(chunk.id) || [];
        if (tokens.length === 0) return { chunk, score: 0 };

        const chunkTf: Record<string, number> = {};
        tokens.forEach(t => {
            chunkTf[t] = (chunkTf[t] || 0) + 1;
        });

        let dotProduct = 0;
        let queryNorm = 0;
        let chunkNorm = 0;

        // All vocabulary
        const vocab = new Set([...Object.keys(queryTf), ...Object.keys(chunkTf)]);

        vocab.forEach(term => {
            const idf = Math.log(1 + (totalDocs - (df[term] || 0) + 0.5) / ((df[term] || 0) + 0.5));
            const qWeight = (queryTf[term] || 0) * idf;
            const cWeight = (chunkTf[term] || 0) * idf;

            dotProduct += qWeight * cWeight;
            queryNorm += qWeight * qWeight;
            chunkNorm += cWeight * cWeight;
        });

        const denom = Math.sqrt(queryNorm) * Math.sqrt(chunkNorm);
        const score = denom > 0 ? dotProduct / denom : 0;

        return { chunk, score };
    });

    // Sort by relevance score descending
    return scored
        .filter(s => s.score > 0.05)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}

/**
 * Pick the excerpts to send: the best TF-IDF matches, or — when nothing matches (e.g. "summarize
 * this") — the opening chunks of each attached file so the model still sees the document.
 */
export function selectContextChunks(query: string, chunks: DocumentChunk[], topK = 4): ScoredChunk[] {
    const ranked = searchRelevantChunks(query, chunks, topK);
    if (ranked.length > 0 || chunks.length === 0) return ranked;

    const byFile = new Map<string, DocumentChunk[]>();
    for (const c of chunks) byFile.set(c.filename, [...(byFile.get(c.filename) ?? []), c]);
    const opening: ScoredChunk[] = [];
    // Round-robin over files so every attachment is represented.
    for (let i = 0; opening.length < topK; i++) {
        let added = false;
        for (const list of byFile.values()) {
            if (list[i] && opening.length < topK) {
                opening.push({ chunk: list[i], score: 0 });
                added = true;
            }
        }
        if (!added) break;
    }
    return opening;
}

/**
 * Formats the selected excerpts as a prompt preamble. The wording is deliberately factual:
 * these excerpts are part of the request sent to the model.
 */
export function formatRAGContext(scoredChunks: ScoredChunk[]): string {
    if (scoredChunks.length === 0) return '';

    const lines = [
        `[Excerpts from files the user attached. Text was extracted in the browser; only these excerpts are included in this request.]`,
        `Use them to answer the question that follows:`,
        ''
    ];

    scoredChunks.forEach(({ chunk, score }) => {
        const pct = Math.round(score * 100);
        const label = score > 0 ? `match ${pct}%` : `opening of the document`;
        lines.push(`--- Source: ${chunk.filename} (${label}) ---`);
        lines.push(chunk.content);
        lines.push('');
    });

    lines.push(`[End of excerpts]\n`);
    return lines.join('\n');
}
