/**
 * SSRF / open-relay guard for the optional `/api/proxy` pass-through route.
 *
 * Every decision here is made on the *parsed* URL (WHATWG URL parser), never on
 * raw strings, so tricks like `https://api.openai.com.evil.com`,
 * `https://api.openai.com@evil.com`, `http://2130706433/` (decimal 127.0.0.1)
 * or a trailing-dot hostname are normalised before they are checked.
 *
 * Kept free of Next.js imports so it can be unit-tested in plain Node.
 */

/** Upstream hosts the proxy may talk to in production. Subdomains are allowed. */
export const ALLOWED_TARGET_HOSTS: readonly string[] = [
    "api.openai.com",
    "api.anthropic.com",
    "api.deepseek.com",
    "api.groq.com",
    "generativelanguage.googleapis.com",
    "openrouter.ai",
];

/** Max request body forwarded upstream (chat payloads are JSON; 1 MiB is generous). */
export const MAX_BODY_BYTES = 1024 * 1024;

/** RFC 7230 §6.1 hop-by-hop headers plus proxy-specific ones that must never be forwarded. */
export const HOP_BY_HOP_HEADERS: ReadonlySet<string> = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);

/**
 * Request headers forwarded upstream. Allowlisting (rather than blocklisting) means
 * cookies, `x-forwarded-*`, `origin`, `referer`, etc. can never leak to a provider.
 */
export const FORWARDED_REQUEST_HEADERS: ReadonlySet<string> = new Set([
    "accept",
    "content-type",
    "authorization",
    "x-api-key",
    "x-goog-api-key",
    "anthropic-version",
    "anthropic-beta",
    "anthropic-dangerous-direct-browser-access",
    "openai-organization",
    "openai-project",
    "http-referer", // OpenRouter attribution
    "x-title",      // OpenRouter attribution
]);

/** Response headers that are never passed back to the browser. */
const STRIPPED_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
    ...HOP_BY_HOP_HEADERS,
    "set-cookie",
    "set-cookie2",
    "content-encoding", // body is re-streamed already decoded
    "content-length",
    "location",
    "access-control-allow-origin",
    "access-control-allow-credentials",
    "access-control-allow-headers",
    "access-control-allow-methods",
    "access-control-expose-headers",
]);

export type TargetCheck =
    | { ok: true; url: URL }
    | { ok: false; status: number; reason: string };

export interface GuardOptions {
    /** True in production. Private / loopback targets are only permitted when false. */
    isProduction: boolean;
    /** Override the allowlist (tests). */
    allowedHosts?: readonly string[];
}

export function isProductionEnv(): boolean {
    return process.env.NODE_ENV === "production";
}

/** Lower-case and strip a single trailing dot (`api.openai.com.` → `api.openai.com`). */
export function normalizeHostname(hostname: string): string {
    let h = hostname.toLowerCase();
    if (h.endsWith(".")) h = h.slice(0, -1);
    // URL keeps brackets around IPv6 literals in `.hostname`
    if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
    return h;
}

/** Exact match or a proper subdomain (label boundary) — never a substring/suffix match. */
export function isHostAllowed(hostname: string, allowed: readonly string[] = ALLOWED_TARGET_HOSTS): boolean {
    const host = normalizeHostname(hostname);
    if (!host || isIpLiteral(host)) return false;
    return allowed.some(a => {
        const entry = a.toLowerCase();
        return host === entry || host.endsWith(`.${entry}`);
    });
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIpLiteral(hostname: string): boolean {
    const h = normalizeHostname(hostname);
    return IPV4_RE.test(h) || h.includes(":");
}

function parseIPv4(h: string): number[] | null {
    const m = IPV4_RE.exec(h);
    if (!m) return null;
    const parts = m.slice(1).map(Number);
    return parts.every(p => p >= 0 && p <= 255) ? parts : null;
}

function isPrivateIPv4([a, b]: number[]): boolean {
    return (
        a === 0 ||                          // 0.0.0.0/8 ("this network")
        a === 10 ||                         // 10.0.0.0/8
        a === 127 ||                        // 127.0.0.0/8 loopback
        (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
        (a === 169 && b === 254) ||         // 169.254.0.0/16 link-local incl. 169.254.169.254 metadata
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
        (a === 192 && b === 168) ||         // 192.168.0.0/16
        (a === 192 && b === 0) ||           // 192.0.0.0/24 + 192.0.2.0/24 (IETF / TEST-NET-1)
        (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 benchmarking
        a >= 224                            // multicast + reserved + broadcast
    );
}

/** Expand an IPv6 literal (already bracket-stripped) into 8 hextets, or null if invalid. */
function expandIPv6(h: string): number[] | null {
    let addr = h;
    const zone = addr.indexOf("%");
    if (zone !== -1) addr = addr.slice(0, zone);

    // Trailing embedded IPv4 (e.g. ::ffff:127.0.0.1)
    const lastColon = addr.lastIndexOf(":");
    const tail = addr.slice(lastColon + 1);
    let v4: number[] | null = null;
    if (tail.includes(".")) {
        v4 = parseIPv4(tail);
        if (!v4) return null;
        addr = `${addr.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
    }

    const halves = addr.split("::");
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(":") : [];
    const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const missing = 8 - head.length - rest.length;
    if (halves.length === 1 && missing !== 0) return null;
    if (missing < 0) return null;
    const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
    if (groups.length !== 8) return null;
    const nums = groups.map(g => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN));
    return nums.some(Number.isNaN) ? null : nums;
}

function isPrivateIPv6(groups: number[]): boolean {
    const allZeroPrefix = groups.slice(0, 5).every(g => g === 0);
    // ::ffff:a.b.c.d (IPv4-mapped) → judge by the embedded IPv4 address
    if (allZeroPrefix && groups[5] === 0xffff) {
        return isPrivateIPv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]);
    }
    if (groups.every(g => g === 0)) return true;                       // :: unspecified
    if (groups.slice(0, 7).every(g => g === 0) && groups[7] === 1) return true; // ::1 loopback
    const first = groups[0];
    if ((first & 0xfe00) === 0xfc00) return true;                       // fc00::/7 unique-local (incl. AWS IMDS fd00:ec2::254)
    if ((first & 0xffc0) === 0xfe80) return true;                       // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true;                       // ff00::/8 multicast
    if (first === 0x0064 && groups[1] === 0xff9b) {                      // 64:ff9b::/96 NAT64 → embedded IPv4
        return isPrivateIPv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]);
    }
    return false;
}

/** True for loopback, private, link-local, metadata and other non-public destinations. */
export function isPrivateOrLocalHost(hostname: string): boolean {
    const h = normalizeHostname(hostname);
    if (!h) return true;
    if (h === "localhost" || h.endsWith(".localhost")) return true;
    if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".home.arpa")) return true;
    if (h === "metadata.google.internal" || h === "metadata") return true;

    const v4 = parseIPv4(h);
    if (v4) return isPrivateIPv4(v4);

    if (h.includes(":")) {
        const v6 = expandIPv6(h);
        return v6 ? isPrivateIPv6(v6) : true; // unparseable IPv6 → treat as unsafe
    }
    return false;
}

/**
 * Validate the `x-target-url` value.
 *
 * Production: https only, default port, host must be on the allowlist, no IP literals,
 * no userinfo, no private/loopback destinations.
 * Development: the above, OR any loopback/private host over http/https (local Ollama,
 * LM Studio, vLLM on the LAN).
 */
export function checkTargetUrl(raw: string | null, opts: GuardOptions): TargetCheck {
    if (!raw) return { ok: false, status: 400, reason: "Missing x-target-url header" };
    if (raw.length > 2048) return { ok: false, status: 414, reason: "Target URL too long" };

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return { ok: false, status: 400, reason: "Invalid target URL" };
    }

    if (url.username || url.password) {
        return { ok: false, status: 400, reason: "Credentials in target URL are not allowed" };
    }

    const host = normalizeHostname(url.hostname);
    const allowed = opts.allowedHosts ?? ALLOWED_TARGET_HOSTS;
    const isLocal = isPrivateOrLocalHost(host);

    if (isLocal) {
        if (opts.isProduction) {
            return { ok: false, status: 403, reason: "Private, loopback and link-local targets are blocked in production" };
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return { ok: false, status: 400, reason: "Unsupported protocol" };
        }
        return { ok: true, url };
    }

    if (url.protocol !== "https:") {
        return { ok: false, status: 400, reason: "Only https:// targets are allowed" };
    }
    if (url.port && url.port !== "443") {
        return { ok: false, status: 403, reason: "Non-standard ports are not allowed" };
    }
    if (isIpLiteral(host)) {
        return { ok: false, status: 403, reason: "IP-literal targets are not allowed" };
    }
    if (!isHostAllowed(host, allowed)) {
        return { ok: false, status: 403, reason: `Host "${host}" is not on the proxy allowlist` };
    }
    return { ok: true, url };
}

/** Build the header set sent upstream: allowlisted names only, never cookies or hop-by-hop. */
export function filterRequestHeaders(incoming: Headers): Headers {
    const out = new Headers();
    // Headers named in `Connection:` are also hop-by-hop for this request.
    const connectionTokens = new Set(
        (incoming.get("connection") || "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean)
    );
    incoming.forEach((value, key) => {
        const k = key.toLowerCase();
        if (HOP_BY_HOP_HEADERS.has(k) || connectionTokens.has(k)) return;
        if (k === "cookie" || k === "cookie2") return;
        if (!FORWARDED_REQUEST_HEADERS.has(k)) return;
        out.set(k, value);
    });
    return out;
}

/** Build the header set returned to the browser: no cookies, hop-by-hop, redirects or upstream CORS. */
export function filterResponseHeaders(upstream: Headers): Headers {
    const out = new Headers();
    upstream.forEach((value, key) => {
        const k = key.toLowerCase();
        if (STRIPPED_RESPONSE_HEADERS.has(k)) return;
        out.set(k, value);
    });
    return out;
}

/**
 * Origins allowed to call the proxy. Defaults to the app's own origin;
 * `PRIVAI_ALLOWED_ORIGINS` (comma-separated) adds more (e.g. a preview domain).
 */
export function resolveAllowedOrigins(selfOrigin: string, envValue = process.env.PRIVAI_ALLOWED_ORIGINS): string[] {
    const extra = (envValue || "")
        .split(",")
        .map(s => s.trim().replace(/\/+$/, ""))
        .filter(Boolean);
    return Array.from(new Set([selfOrigin, ...extra]));
}

export type OriginCheck = { ok: true; allowOrigin: string | null } | { ok: false; reason: string };

/**
 * Browsers always send `Origin` on cross-origin requests and on same-origin POSTs.
 * In production a missing or foreign Origin is rejected; in development a missing
 * Origin is tolerated so `curl` can be used against `next dev`.
 */
export function checkOrigin(origin: string | null, allowedOrigins: string[], isProduction: boolean): OriginCheck {
    if (!origin) {
        return isProduction ? { ok: false, reason: "Missing Origin header" } : { ok: true, allowOrigin: null };
    }
    const normalized = origin.replace(/\/+$/, "");
    if (allowedOrigins.includes(normalized)) return { ok: true, allowOrigin: normalized };
    return { ok: false, reason: `Origin "${origin}" is not allowed` };
}

/**
 * Read a request body while enforcing a hard byte limit. Rejects early on a
 * too-large Content-Length and also counts bytes for chunked bodies that lie.
 */
export async function readBodyWithLimit(
    body: ReadableStream<Uint8Array> | null,
    contentLength: string | null,
    limit = MAX_BODY_BYTES
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; status: number; reason: string }> {
    if (contentLength !== null) {
        const declared = Number(contentLength);
        if (!Number.isFinite(declared) || declared < 0) {
            return { ok: false, status: 400, reason: "Invalid Content-Length" };
        }
        if (declared > limit) {
            return { ok: false, status: 413, reason: `Request body exceeds ${limit} bytes` };
        }
    }
    if (!body) return { ok: true, bytes: new Uint8Array(0) };

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
            await reader.cancel().catch(() => undefined);
            return { ok: false, status: 413, reason: `Request body exceeds ${limit} bytes` };
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.byteLength;
    }
    return { ok: true, bytes };
}
