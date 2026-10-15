import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, OPTIONS } from "./route";

const APP = "http://localhost:3000";

function proxyRequest(target: string | null, init: { origin?: string | null; body?: string; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { "content-type": "application/json", ...init.headers };
    if (target !== null) headers["x-target-url"] = target;
    if (init.origin !== null) headers.origin = init.origin ?? APP;
    return new NextRequest(`${APP}/api/proxy`, {
        method: "POST",
        headers,
        body: init.body ?? JSON.stringify({ model: "gpt-4o-mini", messages: [] }),
    });
}

describe("POST /api/proxy", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.stubEnv("NODE_ENV", "production");
        fetchMock = vi.fn(async () =>
            new Response("data: {\"ok\":true}\n\n", {
                status: 200,
                headers: { "content-type": "text/event-stream", "set-cookie": "t=1" },
            })
        );
        vi.stubGlobal("fetch", fetchMock);
    });

    it("forwards an allowlisted https request with manual redirects and filtered headers", async () => {
        const res = await POST(proxyRequest("https://api.openai.com/v1/chat/completions", {
            headers: { authorization: "Bearer sk-test", cookie: "session=secret" },
        }));
        expect(res.status).toBe(200);
        expect(res.headers.get("access-control-allow-origin")).toBe(APP);
        expect(res.headers.get("set-cookie")).toBeNull();
        expect(await res.text()).toContain("ok");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://api.openai.com/v1/chat/completions");
        expect(init.redirect).toBe("manual");
        const sent = init.headers as Headers;
        expect(sent.get("authorization")).toBe("Bearer sk-test");
        expect(sent.has("cookie")).toBe(false);
        expect(sent.has("origin")).toBe(false);
    });

    it.each([
        ["evil look-alike host", "https://api.openai.com.evil.com/v1/chat/completions", 403],
        ["plain http", "http://api.openai.com/v1/chat/completions", 400],
        ["IPv4 literal (metadata)", "https://169.254.169.254/latest/meta-data/", 403],
        ["IPv6 loopback literal", "https://[::1]/", 403],
        ["localhost in production", "http://localhost:11434/api/chat", 403],
        ["missing target", null, 400],
    ])("rejects %s without calling upstream", async (_label, target, status) => {
        const res = await POST(proxyRequest(target as string | null));
        expect(res.status).toBe(status);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not follow upstream redirects", async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }));
        const res = await POST(proxyRequest("https://api.openai.com/v1/chat/completions"));
        expect(res.status).toBe(502);
        expect(res.headers.get("location")).toBeNull();
        expect(await res.json()).toEqual({ error: "Upstream redirect blocked by proxy" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("rejects requests from a foreign origin", async () => {
        const res = await POST(proxyRequest("https://api.openai.com/v1/chat/completions", { origin: "https://evil.com" }));
        expect(res.status).toBe(403);
        expect(res.headers.get("access-control-allow-origin")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects requests without an Origin in production", async () => {
        const res = await POST(proxyRequest("https://api.openai.com/v1/chat/completions", { origin: null }));
        expect(res.status).toBe(403);
    });

    it("rejects bodies over 1 MiB", async () => {
        const res = await POST(proxyRequest("https://api.openai.com/v1/chat/completions", { body: "x".repeat(1024 * 1024 + 1) }));
        expect(res.status).toBe(413);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("hides upstream network error details", async () => {
        fetchMock.mockRejectedValueOnce(new TypeError("getaddrinfo ENOTFOUND internal-host.corp"));
        const res = await POST(proxyRequest("https://api.openai.com/v1/chat/completions"));
        expect(res.status).toBe(502);
        expect(JSON.stringify(await res.json())).not.toContain("internal-host");
    });

    it("allows local Ollama only in development", async () => {
        vi.stubEnv("NODE_ENV", "development");
        const res = await POST(proxyRequest("http://localhost:11434/api/chat"));
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/chat", expect.anything());
    });
});

describe("OPTIONS /api/proxy", () => {
    beforeEach(() => vi.stubEnv("NODE_ENV", "production"));

    it("echoes only the app origin, never *", async () => {
        const res = await OPTIONS(new NextRequest(`${APP}/api/proxy`, { method: "OPTIONS", headers: { origin: APP } }));
        expect(res.status).toBe(204);
        expect(res.headers.get("access-control-allow-origin")).toBe(APP);
        expect(res.headers.get("access-control-allow-headers")).not.toContain("*");
    });

    it("refuses preflight from a foreign origin", async () => {
        const res = await OPTIONS(new NextRequest(`${APP}/api/proxy`, { method: "OPTIONS", headers: { origin: "https://evil.com" } }));
        expect(res.status).toBe(403);
    });
});
