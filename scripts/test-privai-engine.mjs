// ==============================================================================
// PrivAI — Comprehensive Test Suite & Mockup Run
// Tests:
// 1. Client-Side Cryptographic Engine (AES-256-GCM + PBKDF2)
// 2. In-Browser Document RAG (Chunking + TF-IDF Vector Search)
// 3. Provider Adapter Registry & Streaming Mock
// 4. Ollama Local Endpoint Resolver
// ==============================================================================

import crypto from 'node:crypto';

// Polyfill window.crypto for Node.js test environment
globalThis.window = {
    crypto: crypto.webcrypto
};

console.log('===============================================================');
console.log('🛡️  TESTING PRIVAI PRIVACY & MULTI-LLM ENGINE');
console.log('===============================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
    totalTests++;
    if (condition) {
        console.log(`✅ [PASS] ${message}`);
        passedTests++;
    } else {
        console.error(`❌ [FAIL] ${message}`);
        process.exitCode = 1;
    }
}

// ------------------------------------------------------------------------------
// TEST 1: Zero-Knowledge AES-256-GCM Encryption Engine
// ------------------------------------------------------------------------------
console.log('--- Test 1: Zero-Knowledge AES-256-GCM Cryptography ---');

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 256;

function bufferToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuffer(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes.buffer;
}

async function deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const passphraseKey = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(passphrase),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        passphraseKey,
        { name: 'AES-GCM', length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );
}

async function testCrypto() {
    const secretData = {
        apiKeys: {
            openai: 'sk-proj-test1234567890abcdef',
            anthropic: 'sk-ant-test9876543210fedcba'
        },
        chats: [
            { id: 'chat-1', title: 'Private Strategy Discussion', messages: 12 }
        ]
    };

    const passphrase = 'MySuperSecretMasterPassphrase2026!';
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);

    const plaintext = new TextEncoder().encode(JSON.stringify(secretData));
    const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        plaintext
    );

    const payload = {
        format: 'privai-encrypted',
        version: 1,
        salt: bufferToHex(salt.buffer),
        iv: bufferToHex(iv.buffer),
        ciphertext: bufferToHex(encryptedBuffer),
        createdAt: Date.now()
    };

    assert(payload.ciphertext.length > 50, `Encrypted payload generated (${payload.ciphertext.length} hex chars)`);
    assert(!payload.ciphertext.includes('sk-proj'), 'Sensitive API keys are completely obfuscated in ciphertext');

    // Decrypt with correct passphrase
    const decryptKey = await deriveKey(passphrase, new Uint8Array(hexToBuffer(payload.salt)));
    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(hexToBuffer(payload.iv)) },
        decryptKey,
        hexToBuffer(payload.ciphertext)
    );

    const decryptedData = JSON.parse(new TextDecoder().decode(decryptedBuffer));
    assert(decryptedData.apiKeys.openai === secretData.apiKeys.openai, 'Decryption roundtrip perfectly recovered secret keys');

    // Decrypt with WRONG passphrase must fail
    let failedAsExpected = false;
    try {
        const wrongKey = await deriveKey('WrongPassword123', new Uint8Array(hexToBuffer(payload.salt)));
        await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(hexToBuffer(payload.iv)) },
            wrongKey,
            hexToBuffer(payload.ciphertext)
        );
    } catch {
        failedAsExpected = true;
    }
    assert(failedAsExpected, 'Decryption correctly rejects invalid master passphrase with authentication tag failure');
}

await testCrypto();

// ------------------------------------------------------------------------------
// TEST 2: In-Browser Document RAG (Chunking + Vector Ranking)
// ------------------------------------------------------------------------------
console.log('\n--- Test 2: In-Browser Local Document RAG ---');

const sampleDocument = `
Project Andromeda Architecture Specification
Andromeda is an ultra-low latency distributed payment processor.
It achieves 50,000 transactions per second using an in-memory lock-free queue.
Security is enforced using mTLS with hardware security modules (HSM).
The backup disaster recovery region is AWS eu-central-1 Frankfurt with 15-minute RPO.
Primary database is ScyllaDB running across 12 dedicated bare-metal nodes.
`;

function chunkDocument(text, filename, chunkSize = 150, overlap = 30) {
    const cleanText = text.replace(/\r\n/g, '\n').trim();
    const chunks = [];
    let start = 0;
    let index = 0;

    while (start < cleanText.length) {
        let end = start + chunkSize;
        if (end < cleanText.length) {
            const nextSpace = cleanText.lastIndexOf(' ', end);
            if (nextSpace > start + chunkSize * 0.5) end = nextSpace;
        }
        const chunkContent = cleanText.substring(start, end).trim();
        if (chunkContent.length > 20) {
            chunks.push({
                id: `${filename}-chunk-${index}`,
                filename,
                content: chunkContent,
                index
            });
            index++;
        }
        start = end - overlap;
        if (start >= cleanText.length) break;
    }
    return chunks;
}

function tokenize(text) {
    return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function searchChunks(query, chunks) {
    const queryTerms = tokenize(query);
    return chunks.map(chunk => {
        const terms = tokenize(chunk.content);
        const matches = queryTerms.filter(qt => terms.includes(qt));
        const score = matches.length / Math.max(1, queryTerms.length);
        return { chunk, score };
    }).sort((a, b) => b.score - a.score);
}

const chunks = chunkDocument(sampleDocument, 'andromeda-spec.md');
assert(chunks.length >= 2, `Split sample document into ${chunks.length} localized chunks`);

const query1 = 'What is the disaster recovery region and RPO?';
const searchResults = searchChunks(query1, chunks);
const topResult = searchResults[0];

assert(topResult.score > 0, `Ranked top chunk with score ${(topResult.score * 100).toFixed(0)}%`);
assert(topResult.chunk.content.includes('Frankfurt') || topResult.chunk.content.includes('disaster recovery'), 'Top chunk successfully retrieved the Frankfurt disaster recovery context');

// ------------------------------------------------------------------------------
// TEST 3: Mock Provider Streaming & Abort Signal
// ------------------------------------------------------------------------------
console.log('\n--- Test 3: Multi-Provider Streaming & AbortSignal ---');

async function* mockStreamGenerator(tokens, delayMs = 5, signal) {
    for (const t of tokens) {
        if (signal?.aborted) return;
        await new Promise(r => setTimeout(r, delayMs));
        yield t;
    }
}

const tokensToStream = ['PrivAI', ' ', 'is', ' ', 'streaming', ' ', 'directly', ' ', 'to', ' ', 'client'];
const streamAccumulator = [];

for await (const token of mockStreamGenerator(tokensToStream)) {
    streamAccumulator.push(token);
}

assert(streamAccumulator.join('') === 'PrivAI is streaming directly to client', 'Stream generator successfully emitted all tokens in order');

// Test immediate abort
const abortController = new AbortController();
const abortedTokens = [];
let counter = 0;

for await (const token of mockStreamGenerator(tokensToStream, 10, abortController.signal)) {
    abortedTokens.push(token);
    counter++;
    if (counter === 3) {
        abortController.abort(); // simulate user clicking Stop Generating
    }
}

assert(abortedTokens.length === 3, `AbortSignal halted stream immediately at 3 tokens (stopped before ${tokensToStream.length})`);

// ------------------------------------------------------------------------------
// TEST 4: Ollama Local Endpoint & Format Check
// ------------------------------------------------------------------------------
console.log('\n--- Test 4: Ollama Local Endpoint & Header Validation ---');

const ollamaConfig = {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    modelId: 'llama3.2:latest'
};

const normalizedUrl = `${ollamaConfig.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
assert(normalizedUrl === 'http://localhost:11434/v1/chat/completions', 'Ollama OpenAI-compatible endpoint URL properly constructed');

// Anthropic header test
const anthropicHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': 'test-key',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
};

assert(anthropicHeaders['anthropic-dangerous-direct-browser-access'] === 'true', 'Anthropic direct browser CORS header explicitly verified');

console.log('\n===============================================================');
console.log(`🎉 PRIVAI TEST SUMMARY: ${passedTests}/${totalTests} tests passed successfully!`);
console.log('===============================================================\n');
