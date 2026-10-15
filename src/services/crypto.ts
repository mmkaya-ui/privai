/**
 * PrivAI Client-Side Zero-Knowledge Encryption Engine
 * Uses Web Crypto API (SubtleCrypto) with AES-256-GCM & PBKDF2
 * Zero dependencies, 100% client-side in the browser.
 *
 * Used for portable `.privai` backups. Each call to `encryptData`:
 *  - draws a fresh 16-byte salt and 12-byte IV from the CSPRNG,
 *  - derives a non-extractable AES-256-GCM key (PBKDF2-HMAC-SHA256) that only
 *    lives in memory for the duration of the call and is never persisted,
 *  - binds the format/version/KDF parameters as GCM additional authenticated data,
 *    so tampering with the header (e.g. lowering iterations) fails authentication.
 */

/** OWASP Password Storage Cheat Sheet (2023+) recommendation for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;
/** Iteration count used by v1 payloads (kept so existing backups still decrypt). */
const LEGACY_V1_ITERATIONS = 100_000;
/** Refuse absurd iteration counts from untrusted files (DoS guard). */
const MAX_ITERATIONS = 5_000_000;
const KEY_LENGTH = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12;
/** AES-GCM appends a 16-byte authentication tag to the ciphertext. */
const GCM_TAG_BYTES = 16;
export const MIN_PASSPHRASE_LENGTH = 8;

function getSubtle(): SubtleCrypto {
    const c = globalThis.crypto;
    if (!c?.subtle) throw new Error('Web Crypto API is not available in this environment (requires a secure context).');
    return c.subtle;
}

function randomBytes(n: number): Uint8Array {
    return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

// Converts bytes to a lowercase hex string
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let out = '';
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
    return out;
}

// Converts a hex string to bytes. Throws on odd length or non-hex characters
// instead of silently turning garbage into zero bytes.
export function hexToBytes(hex: string): Uint8Array {
    if (typeof hex !== 'string') throw new Error('Malformed hex: expected a string');
    if (hex.length % 2 !== 0) throw new Error('Malformed hex: odd number of characters');
    if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error('Malformed hex: invalid characters');
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

// Derives an AES-GCM CryptoKey from a user passphrase using PBKDF2.
// The key is non-extractable and is never stored anywhere.
async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    const subtle = getSubtle();
    const passphraseKey = await subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    return subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt as BufferSource,
            iterations,
            hash: 'SHA-256'
        },
        passphraseKey,
        { name: 'AES-GCM', length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );
}

export interface EncryptedPrivAIPayload {
    format: 'privai-encrypted';
    version: 1 | 2;
    /** PBKDF2 iterations (v2+). v1 payloads implicitly used 100,000. */
    iterations?: number;
    salt: string; // hex
    iv: string;   // hex
    ciphertext: string; // hex (ciphertext || 16-byte GCM tag)
    createdAt: number;
}

function additionalData(version: number, iterations: number): Uint8Array {
    return new TextEncoder().encode(`privai-encrypted:v${version}:pbkdf2-sha256:${iterations}`);
}

/**
 * Encrypts arbitrary JavaScript data into an AES-256-GCM payload with user passphrase
 */
export async function encryptData(data: unknown, passphrase: string): Promise<EncryptedPrivAIPayload> {
    if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new Error(`Master passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
    }

    const iterations = PBKDF2_ITERATIONS;
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const key = await deriveKey(passphrase, salt, iterations);

    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const encryptedBuffer = await getSubtle().encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: additionalData(2, iterations) as BufferSource },
        key,
        plaintext
    );

    return {
        format: 'privai-encrypted',
        version: 2,
        iterations,
        salt: bufferToHex(salt),
        iv: bufferToHex(iv),
        ciphertext: bufferToHex(encryptedBuffer),
        createdAt: Date.now()
    };
}

/**
 * Decrypts an AES-256-GCM payload with user passphrase
 */
export async function decryptData<T = unknown>(payload: EncryptedPrivAIPayload, passphrase: string): Promise<T> {
    if (!payload || typeof payload !== 'object' || payload.format !== 'privai-encrypted') {
        throw new Error('Invalid backup file format. Expected a .privai encrypted backup.');
    }
    if (payload.version !== 1 && payload.version !== 2) {
        throw new Error(`Unsupported backup version: ${String(payload.version)}`);
    }
    if (!passphrase) throw new Error('Passphrase is required');

    let salt: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array;
    try {
        salt = hexToBytes(payload.salt);
        iv = hexToBytes(payload.iv);
        ciphertext = hexToBytes(payload.ciphertext);
    } catch (e) {
        throw new Error(`Corrupted backup: ${(e as Error).message}`);
    }
    if (salt.length !== SALT_BYTES) throw new Error('Corrupted backup: invalid salt length');
    if (iv.length !== IV_BYTES) throw new Error('Corrupted backup: invalid IV length');
    if (ciphertext.length < GCM_TAG_BYTES) throw new Error('Corrupted backup: ciphertext too short');

    const iterations = payload.version === 1 ? LEGACY_V1_ITERATIONS : payload.iterations;
    if (!Number.isInteger(iterations) || iterations! < LEGACY_V1_ITERATIONS || iterations! > MAX_ITERATIONS) {
        throw new Error('Corrupted backup: invalid KDF parameters');
    }

    const key = await deriveKey(passphrase, salt, iterations!);
    const params: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource };
    if (payload.version === 2) params.additionalData = additionalData(2, iterations!) as BufferSource;

    let decryptedBuffer: ArrayBuffer;
    try {
        decryptedBuffer = await getSubtle().decrypt(params, key, ciphertext as BufferSource);
    } catch {
        throw new Error('Decryption failed. Incorrect passphrase or corrupted backup.');
    }

    try {
        return JSON.parse(new TextDecoder().decode(decryptedBuffer)) as T;
    } catch {
        throw new Error('Decryption succeeded but the backup contents are not valid JSON.');
    }
}
