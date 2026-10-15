import { describe, it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
    encryptData,
    decryptData,
    hexToBytes,
    bufferToHex,
    PBKDF2_ITERATIONS,
    type EncryptedPrivAIPayload,
} from "./crypto";

const PASS = "correct horse battery";
const SECRET = { apiKeys: { openai: "sk-live-abc123" }, sessions: [{ id: "1", title: "héllo 🌍" }] };

describe("hex helpers", () => {
    it("round-trips bytes", () => {
        const bytes = new Uint8Array([0, 1, 15, 16, 127, 128, 255]);
        expect(bufferToHex(bytes)).toBe("00010f107f80ff");
        expect(Array.from(hexToBytes("00010F107f80FF"))).toEqual(Array.from(bytes));
        expect(hexToBytes("").length).toBe(0);
    });

    it.each([
        ["odd length", "abc"],
        ["non-hex characters", "zz"],
        ["whitespace", "ab cd"],
        ["sign prefix that parseInt would accept", "-1"],
        ["0x prefix", "0xab"],
    ])("rejects %s", (_label, input) => {
        expect(() => hexToBytes(input)).toThrow(/Malformed hex/);
    });
});

describe("encryptData / decryptData", () => {
    it("round-trips data and hides plaintext", async () => {
        const payload = await encryptData(SECRET, PASS);
        expect(payload).toMatchObject({ format: "privai-encrypted", version: 2, iterations: PBKDF2_ITERATIONS });
        expect(payload.salt).toHaveLength(32); // 16 bytes
        expect(payload.iv).toHaveLength(24);   // 12 bytes
        expect(JSON.stringify(payload)).not.toContain("sk-live-abc123");
        await expect(decryptData(payload, PASS)).resolves.toEqual(SECRET);
    }, 30_000);

    it("uses a fresh random salt and IV for every encryption", async () => {
        const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
        const a = await encryptData(SECRET, PASS);
        const b = await encryptData(SECRET, PASS);
        expect(a.salt).not.toBe(b.salt);
        expect(a.iv).not.toBe(b.iv);
        expect(a.ciphertext).not.toBe(b.ciphertext);
        // salt + iv per call, all from the CSPRNG
        expect(spy).toHaveBeenCalledTimes(4);
    }, 30_000);

    it("derives a non-extractable key and never returns or stores it", async () => {
        const deriveSpy = vi.spyOn(globalThis.crypto.subtle, "deriveKey");
        const payload = await encryptData(SECRET, PASS);
        const extractable = deriveSpy.mock.calls[0][3];
        expect(extractable).toBe(false);
        expect(Object.keys(payload).sort()).toEqual(["ciphertext", "createdAt", "format", "iterations", "iv", "salt", "version"]);
    }, 30_000);

    it("rejects a wrong passphrase", async () => {
        const payload = await encryptData(SECRET, PASS);
        await expect(decryptData(payload, "wrong passphrase")).rejects.toThrow(/Incorrect passphrase/);
    }, 30_000);

    it("detects tampering with the authenticated header (iterations downgrade)", async () => {
        const payload = await encryptData(SECRET, PASS);
        await expect(decryptData({ ...payload, iterations: 100_000 }, PASS)).rejects.toThrow(/Incorrect passphrase or corrupted/);
    }, 30_000);

    it("detects ciphertext bit-flips", async () => {
        const payload = await encryptData(SECRET, PASS);
        const flipped = (parseInt(payload.ciphertext[0], 16) ^ 1).toString(16) + payload.ciphertext.slice(1);
        await expect(decryptData({ ...payload, ciphertext: flipped }, PASS)).rejects.toThrow(/Incorrect passphrase or corrupted/);
    }, 30_000);

    it("enforces a minimum passphrase length", async () => {
        await expect(encryptData(SECRET, "short")).rejects.toThrow(/at least 8/);
    });

    it.each<[string, Partial<EncryptedPrivAIPayload>, RegExp]>([
        ["malformed salt hex", { salt: "zz".repeat(16) }, /Corrupted backup: Malformed hex/],
        ["odd-length iv", { iv: "abc" }, /Corrupted backup: Malformed hex/],
        ["short salt", { salt: "00".repeat(8) }, /invalid salt length/],
        ["short iv", { iv: "00".repeat(8) }, /invalid IV length/],
        ["truncated ciphertext", { ciphertext: "00" }, /ciphertext too short/],
        ["absurd iterations", { iterations: 1e9 }, /invalid KDF parameters/],
        ["missing iterations", { iterations: undefined }, /invalid KDF parameters/],
    ])("rejects %s before attempting decryption", async (_label, patch, err) => {
        const base: EncryptedPrivAIPayload = {
            format: "privai-encrypted", version: 2, iterations: PBKDF2_ITERATIONS,
            salt: "00".repeat(16), iv: "00".repeat(12), ciphertext: "00".repeat(32), createdAt: 0,
        };
        await expect(decryptData({ ...base, ...patch }, PASS)).rejects.toThrow(err);
    });

    it("rejects non-privai files and unknown versions", async () => {
        await expect(decryptData({ format: "nope" } as unknown as EncryptedPrivAIPayload, PASS)).rejects.toThrow(/Invalid backup/);
        await expect(decryptData({ format: "privai-encrypted", version: 9 } as unknown as EncryptedPrivAIPayload, PASS)).rejects.toThrow(/Unsupported backup version/);
    });

    it("still decrypts legacy v1 backups (100k iterations, no AAD)", async () => {
        // Produce a v1 payload exactly the way the previous implementation did.
        const salt = webcrypto.getRandomValues(new Uint8Array(16));
        const iv = webcrypto.getRandomValues(new Uint8Array(12));
        const base = await webcrypto.subtle.importKey("raw", new TextEncoder().encode("legacy"), "PBKDF2", false, ["deriveKey"]);
        const key = await webcrypto.subtle.deriveKey(
            { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
            base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
        );
        const ct = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(SECRET)));
        const v1: EncryptedPrivAIPayload = {
            format: "privai-encrypted", version: 1,
            salt: bufferToHex(salt), iv: bufferToHex(iv), ciphertext: bufferToHex(ct), createdAt: 0,
        };
        await expect(decryptData(v1, "legacy")).resolves.toEqual(SECRET);
    }, 30_000);
});
