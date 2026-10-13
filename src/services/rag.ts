/**
 * PrivAI In-Browser Local Document RAG Engine
 * Zero Server Uploads: 100% Client-Side Parsing, Chunking & Vector Search
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
 * Parses files purely client-side without any server API calls
 */
export async function parseDocument(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase();

    // Plain text / code formats
    if (['txt', 'md', 'json', 'csv', 'js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css', 'yaml', 'yml', 'xml', 'sql'].includes(ext || '')) {
        return await file.text();
    }

    // PDF client-side parsing fallback
    if (ext === 'pdf') {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        // Extract ASCII/UTF-8 readable text segments from PDF streams
        let text = '';
        let currentString = '';
        for (let i = 0; i < bytes.length; i++) {
            const charCode = bytes[i];
            // printable ASCII or common whitespace
            if ((charCode >= 32 && charCode <= 126) || charCode === 10 || charCode === 13 || charCode === 9) {
                currentString += String.fromCharCode(charCode);
            } else {
                if (currentString.length > 4 && /[a-zA-Z]{3,}/.test(currentString)) {
                    text += currentString + ' ';
                }
                currentString = '';
            }
        }
        if (text.length > 50) {
            return text.replace(/\s+/g, ' ').trim();
        }
        return `[PDF Document: ${file.name} - ${Math.round(file.size / 1024)} KB]`;
    }

    // Default to plain text
    return await file.text();
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
 * In-Browser Vector & TF-IDF Cosine Similarity Search Engine
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
 * Formats retrieved chunks into private prompt augmentation
 */
export function formatRAGContext(scoredChunks: ScoredChunk[]): string {
    if (scoredChunks.length === 0) return '';

    const lines = [
        `[PRIVAI LOCAL DOCUMENT INTELLIGENCE (Zero bytes transmitted to external servers)]:`,
        `The user has attached local private documents on their machine. Use the following context to answer:`,
        ''
    ];

    scoredChunks.forEach(({ chunk, score }) => {
        const pct = Math.round(score * 100);
        lines.push(`--- Source: ${chunk.filename} (Match Relevance: ${pct}%) ---`);
        lines.push(chunk.content);
        lines.push('');
    });

    lines.push(`[END OF LOCAL CONTEXT]\n`);
    return lines.join('\n');
}
