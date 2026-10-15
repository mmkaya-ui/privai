import { NextRequest, NextResponse } from "next/server";
import {
    checkOrigin,
    checkTargetUrl,
    filterRequestHeaders,
    filterResponseHeaders,
    isProductionEnv,
    readBodyWithLimit,
    resolveAllowedOrigins,
} from "@/lib/proxy-guard";

/**
 * Optional stateless pass-through for providers/gateways that do not send CORS
 * headers to browsers. It never logs, parses or stores payloads.
 *
 * Security model (see src/lib/proxy-guard.ts):
 *  - Only allowlisted provider hosts over https (exact or subdomain match on the parsed hostname).
 *  - Loopback / private / link-local / metadata targets are blocked in production.
 *  - Only the app's own origin (plus PRIVAI_ALLOWED_ORIGINS) may call it.
 *  - Allowlisted request headers only: cookies and hop-by-hop headers never leave.
 *  - Body capped at 1 MiB, upstream redirects are never followed.
 */
export const runtime = "edge";

function corsHeaders(allowOrigin: string | null): Record<string, string> {
    if (!allowOrigin) return {};
    return {
        "Access-Control-Allow-Origin": allowOrigin,
        "Vary": "Origin",
    };
}

function deny(status: number, reason: string, allowOrigin: string | null = null) {
    return NextResponse.json({ error: reason }, { status, headers: corsHeaders(allowOrigin) });
}

export async function OPTIONS(req: NextRequest) {
    const isProduction = isProductionEnv();
    const origin = checkOrigin(req.headers.get("origin"), resolveAllowedOrigins(req.nextUrl.origin), isProduction);
    if (!origin.ok) return deny(403, origin.reason);

    return new NextResponse(null, {
        status: 204,
        headers: {
            ...corsHeaders(origin.allowOrigin),
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": [
                "content-type",
                "authorization",
                "x-api-key",
                "x-goog-api-key",
                "x-target-url",
                "anthropic-version",
                "anthropic-beta",
                "anthropic-dangerous-direct-browser-access",
            ].join(", "),
            "Access-Control-Max-Age": "600",
        },
    });
}

export async function POST(req: NextRequest) {
    const isProduction = isProductionEnv();

    const origin = checkOrigin(req.headers.get("origin"), resolveAllowedOrigins(req.nextUrl.origin), isProduction);
    if (!origin.ok) return deny(403, origin.reason);
    const allowOrigin = origin.allowOrigin;

    const target = checkTargetUrl(req.headers.get("x-target-url"), { isProduction });
    if (!target.ok) return deny(target.status, target.reason, allowOrigin);

    const body = await readBodyWithLimit(req.body, req.headers.get("content-length"));
    if (!body.ok) return deny(body.status, body.reason, allowOrigin);

    let upstream: Response;
    try {
        upstream = await fetch(target.url.toString(), {
            method: "POST",
            headers: filterRequestHeaders(req.headers),
            body: body.bytes as BodyInit,
            // Never follow redirects: a 30x to http://169.254.169.254 would bypass the allowlist.
            redirect: "manual",
            // Client disconnect / abort cancels the upstream request too.
            signal: req.signal,
            cache: "no-store",
        });
    } catch (err: unknown) {
        const e = err as Error;
        if (e.name === "AbortError") return deny(499, "Client closed request", allowOrigin);
        // Don't echo internal error details (hostnames, resolver output) back to the caller.
        return deny(502, "Upstream request failed", allowOrigin);
    }

    // `redirect: "manual"` surfaces 3xx (or an opaqueredirect with status 0) instead of following it.
    if (upstream.type === "opaqueredirect" || (upstream.status >= 300 && upstream.status < 400)) {
        await upstream.body?.cancel().catch(() => undefined);
        return deny(502, "Upstream redirect blocked by proxy", allowOrigin);
    }

    const headers = filterResponseHeaders(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders(allowOrigin))) headers.set(k, v);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");

    return new NextResponse(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}
