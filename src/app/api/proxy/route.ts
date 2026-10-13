import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const _ALLOWED_TARGET_HOSTS = [
    "api.openai.com",
    "api.anthropic.com",
    "api.deepseek.com",
    "api.groq.com",
    "generativelanguage.googleapis.com",
    "openrouter.ai",
    "localhost",
    "127.0.0.1"
];

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
    });
}

export async function POST(req: NextRequest) {
    const targetUrl = req.headers.get("x-target-url");
    if (!targetUrl) {
        return NextResponse.json({ error: "Missing x-target-url header" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(targetUrl);
    } catch {
        return NextResponse.json({ error: "Invalid target URL" }, { status: 400 });
    }

    // Safety check: only allow http/https
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
    }

    // Prepare headers for upstream, removing host-specific ones
    const forwardHeaders = new Headers();
    req.headers.forEach((val, key) => {
        const lower = key.toLowerCase();
        if (!["host", "x-target-url", "connection", "content-length"].includes(lower)) {
            forwardHeaders.set(key, val);
        }
    });

    try {
        const body = req.body;
        const fetchOptions: RequestInit & { duplex?: string } = {
            method: "POST",
            headers: forwardHeaders,
            body,
            duplex: "half"
        };
        const upstreamRes = await fetch(targetUrl, fetchOptions);

        const responseHeaders = new Headers();
        upstreamRes.headers.forEach((val, key) => {
            const lower = key.toLowerCase();
            if (!["content-encoding", "content-length", "transfer-encoding"].includes(lower)) {
                responseHeaders.set(key, val);
            }
        });

        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Cache-Control", "no-cache");

        return new NextResponse(upstreamRes.body, {
            status: upstreamRes.status,
            statusText: upstreamRes.statusText,
            headers: responseHeaders
        });
    } catch (err: unknown) {
        const error = err as Error;
        return NextResponse.json(
            { error: `Proxy pass-through failed: ${error.message}` },
            {
                status: 502,
                headers: { "Access-Control-Allow-Origin": "*" }
            }
        );
    }
}
