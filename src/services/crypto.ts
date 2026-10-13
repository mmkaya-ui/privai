/**
 * PrivAI Client-Side Zero-Knowledge Encryption Engine
 * Uses Web Crypto API (SubtleCrypto) with AES-256-GCM & PBKDF2
 * Zero dependencies, 100% client-side in the browser.
 */

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 256;

// Converts an ArrayBuffer to a hex string
function bufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Converts a hex string to an ArrayBuffer
function hexToBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes.buffer;
}

// Derives an AES-GCM CryptoKey from a user passphrase using PBKDF2
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
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
            salt: salt as BufferSource,
            iterations: PBKDF2_ITERATIONS,
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
    version: 1;
    salt: string; // hex
    iv: string;   // hex
    ciphertext: string; // hex
    createdAt: number;
}

/**
 * Encrypts arbitrary JavaScript data into an AES-256-GCM payload with user passphrase
 */
export async function encryptData(data: unknown, passphrase: string): Promise<EncryptedPrivAIPayload> {
    if (!passphrase || passphrase.length < 4) {
        throw new Error('Master passphrase must be at least 4 characters');
    }

    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);

    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        plaintext
    );

    return {
        format: 'privai-encrypted',
        version: 1,
        salt: bufferToHex(salt.buffer),
        iv: bufferToHex(iv.buffer),
        ciphertext: bufferToHex(encryptedBuffer),
        createdAt: Date.now()
    };
}

/**
 * Decrypts an AES-256-GCM payload with user passphrase
 */
export async function decryptData<T = unknown>(payload: EncryptedPrivAIPayload, passphrase: string): Promise<T> {
    if (payload.format !== 'privai-encrypted') {
        throw new Error('Invalid backup file format. Expected a .privai encrypted backup.');
    }

    const salt = new Uint8Array(hexToBuffer(payload.salt));
    const iv = new Uint8Array(hexToBuffer(payload.iv));
    const ciphertext = hexToBuffer(payload.ciphertext);

    const key = await deriveKey(passphrase, salt);

    try {
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );

        const decodedText = new TextDecoder().decode(decryptedBuffer);
        return JSON.parse(decodedText);
    } catch {
        throw new Error('Decryption failed. Incorrect passphrase or corrupted backup.');
    }
}
