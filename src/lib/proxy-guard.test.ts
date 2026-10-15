import { describe, it, expect } from "vitest";
import {
    checkTargetUrl,
    checkOrigin,
    filterRequestHeaders,
    filterResponseHeaders,
    isHostAllowed,
    isPrivateOrLocalHost,
    readBodyWithLimit,
    resolveAllowedOrigins,
} from "./proxy-guard";

const prod = { isProduction: true };
const dev = { isProduction: false };

describe("isHostAllowed", () => {
    it("accepts exact allowlisted hosts and proper subdomains", () => {
        expect(isHostAllowed("api.openai.com")).toBe(true);
        expect(isHostAllowed("API.OpenAI.com")).toBe(true);
        expect(isHostAllowed("api.openai.com.")).toBe(true); // trailing-dot FQDN
        expect(isHostAllowed("eu.api.openai.com")).toBe(true);
    });

    it("rejects suffix/substring look-alikes", () => {
        expect(isHostAllowed("api.openai.com.evil.com")).toBe(false);
        expect(isHostAllowed("evilapi.openai.com")).toBe(false);
        expect(isHostAllowed("notopenrouter.ai")).toBe(false);
        expect(isHostAllowed("openai.com")).toBe(false);
        expect(isHostAllowed("")).toBe(false);
    });
});

describe("isPrivateOrLocalHost", () => {
    it.each([
        "localhost", "foo.localhost", "printer.local", "db.internal",
        "127.0.0.1", "127.1.2.3", "10.0.0.5", "172.16.0.1", "172.31.255.255",
        "192.168.1.10", "169.254.169.254", "0.0.0.0", "100.64.0.1",
        "::1", "[::1]", "::", "fe80::1", "fc00::1", "fd00:ec2::254",
        "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::a00:1",
        "metadata.google.internal",
    ])("flags %s as private", host => {
        expect(isPrivateOrLocalHost(host)).toBe(true);
    });

    it.each(["api.openai.com", "8.8.8.8", "172.32.0.1", "172.15.255.255", "2606:4700::1111", "::ffff:8.8.8.8"])(
        "treats %s as public",
        host => {
            expect(isPrivateOrLocalHost(host)).toBe(false);
        }
    );
});

describe("checkTargetUrl (production)", () => {
    it("allows an allowlisted https host", () => {
        const r = checkTargetUrl("https://api.openai.com/v1/chat/completions", prod);
        expect(r.ok).toBe(true);
    });

    it("blocks a look-alike evil host", () => {
        const r = checkTargetUrl("https://api.openai.com.evil.com/v1/chat/completions", prod);
        expect(r).toMatchObject({ ok: false, status: 403 });
    });

    it("blocks userinfo tricks (api.openai.com@evil.com)", () => {
        const r = checkTargetUrl("https://api.openai.com@evil.com/v1", prod);
        expect(r).toMatchObject({ ok: false, status: 400 });
    });

    it("blocks plain http:// even for allowlisted hosts", () => {
        const r = checkTargetUrl("http://api.openai.com/v1/chat/completions", prod);
        expect(r).toMatchObject({ ok: false, status: 400 });
    });

    it.each(["ftp://api.openai.com/", "file:///etc/passwd", "javascript:alert(1)", "data:text/plain,hi"])(
        "blocks non-http protocol %s",
        url => {
            expect(checkTargetUrl(url, prod).ok).toBe(false);
        }
    );

    it.each([
        "https://127.0.0.1/",
        "https://169.254.169.254/latest/meta-data/",
        "https://10.1.2.3/",
        "https://192.168.0.1/",
        "https://[::1]/",
        "https://[::ffff:127.0.0.1]/",
        "https://2130706433/",   // decimal 127.0.0.1, normalised by the URL parser
        "https://0x7f.0.0.1/",   // hex octet
        "https://localhost:11434/api/chat",
    ])("blocks private / loopback IP literal %s", url => {
        expect(checkTargetUrl(url, prod)).toMatchObject({ ok: false, status: 403 });
    });

    it("blocks public IP literals (not on allowlist)", () => {
        expect(checkTargetUrl("https://8.8.8.8/", prod)).toMatchObject({ ok: false, status: 403 });
        expect(checkTargetUrl("https://[2606:4700::1111]/", prod)).toMatchObject({ ok: false, status: 403 });
    });

    it("blocks non-standard ports", () => {
        expect(checkTargetUrl("https://api.openai.com:8443/v1", prod)).toMatchObject({ ok: false, status: 403 });
    });

    it("rejects missing, malformed and oversized URLs", () => {
        expect(checkTargetUrl(null, prod)).toMatchObject({ ok: false, status: 400 });
        expect(checkTargetUrl("not a url", prod)).toMatchObject({ ok: false, status: 400 });
        expect(checkTargetUrl(`https://api.openai.com/${"a".repeat(3000)}`, prod)).toMatchObject({ ok: false, status: 414 });
    });
});

describe("checkTargetUrl (development)", () => {
    it("allows local Ollama / LM Studio over http", () => {
        expect(checkTargetUrl("http://localhost:11434/api/chat", dev).ok).toBe(true);
        expect(checkTargetUrl("http://127.0.0.1:1234/v1/chat/completions", dev).ok).toBe(true);
        expect(checkTargetUrl("http://192.168.1.20:8000/v1/chat/completions", dev).ok).toBe(true);
    });

    it("still enforces the allowlist and https for public hosts", () => {
        expect(checkTargetUrl("https://evil.com/", dev).ok).toBe(false);
        expect(checkTargetUrl("http://api.openai.com/", dev).ok).toBe(false);
        expect(checkTargetUrl("https://api.openai.com.evil.com/", dev).ok).toBe(false);
    });
});

describe("header filtering", () => {
    it("forwards only allowlisted request headers and drops cookies + hop-by-hop", () => {
        const incoming = new Headers({
            "content-type": "application/json",
            authorization: "Bearer sk-test",
            "x-api-key": "anthropic-key",
            cookie: "session=abc",
            connection: "keep-alive, x-custom",
            "keep-alive": "timeout=5",
            "x-custom": "hop",
            "proxy-authorization": "Basic xyz",
            "x-forwarded-for": "1.2.3.4",
            origin: "https://app.example",
            host: "app.example",
        });
        const out = filterRequestHeaders(incoming);
        expect(out.get("authorization")).toBe("Bearer sk-test");
        expect(out.get("x-api-key")).toBe("anthropic-key");
        expect(out.get("content-type")).toBe("application/json");
        for (const h of ["cookie", "connection", "keep-alive", "x-custom", "proxy-authorization", "x-forwarded-for", "origin", "host"]) {
            expect(out.has(h)).toBe(false);
        }
    });

    it("strips set-cookie, location and upstream CORS from responses", () => {
        const out = filterResponseHeaders(new Headers({
            "content-type": "text/event-stream",
            "set-cookie": "tracker=1",
            location: "http://169.254.169.254/",
            "access-control-allow-origin": "*",
            "transfer-encoding": "chunked",
            "x-request-id": "req_123",
        }));
        expect(out.get("content-type")).toBe("text/event-stream");
        expect(out.get("x-request-id")).toBe("req_123");
        for (const h of ["set-cookie", "location", "access-control-allow-origin", "transfer-encoding"]) {
            expect(out.has(h)).toBe(false);
        }
    });
});

describe("origin checks", () => {
    const allowed = resolveAllowedOrigins("https://privai.app", "https://preview.privai.app/");

    it("accepts the app origin and configured extras", () => {
        expect(checkOrigin("https://privai.app", allowed, true)).toEqual({ ok: true, allowOrigin: "https://privai.app" });
        expect(checkOrigin("https://preview.privai.app", allowed, true).ok).toBe(true);
    });

    it("rejects foreign origins and (in production) a missing origin", () => {
        expect(checkOrigin("https://evil.com", allowed, true).ok).toBe(false);
        expect(checkOrigin(null, allowed, true).ok).toBe(false);
        expect(checkOrigin(null, allowed, false)).toEqual({ ok: true, allowOrigin: null });
    });
});

describe("readBodyWithLimit", () => {
    const streamOf = (...parts: string[]) =>
        new ReadableStream<Uint8Array>({
            start(c) {
                parts.forEach(p => c.enqueue(new TextEncoder().encode(p)));
                c.close();
            },
        });

    it("reads bodies under the limit", async () => {
        const r = await readBodyWithLimit(streamOf("hello ", "world"), null, 64);
        expect(r.ok && new TextDecoder().decode(r.bytes)).toBe("hello world");
    });

    it("rejects a declared Content-Length over the limit without reading", async () => {
        expect(await readBodyWithLimit(streamOf("x"), "999999", 64)).toMatchObject({ ok: false, status: 413 });
    });

    it("rejects chunked bodies that exceed the limit while streaming", async () => {
        expect(await readBodyWithLimit(streamOf("a".repeat(40), "b".repeat(40)), null, 64)).toMatchObject({ ok: false, status: 413 });
    });

    it("rejects a bogus Content-Length", async () => {
        expect(await readBodyWithLimit(streamOf("x"), "-1", 64)).toMatchObject({ ok: false, status: 400 });
    });
});
