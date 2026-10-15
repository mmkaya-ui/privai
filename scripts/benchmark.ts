/**
 * PrivAI provider benchmark — same prompts, two models, measured with the exact
 * streaming + accounting code the app uses (`streamChat`).
 *
 *   npm run bench                                   # ollama:llama3.2 vs groq:openai/gpt-oss-20b
 *   npm run bench -- --a anthropic:claude-haiku-5-5 --b openai:gpt-6-luna --runs 5
 *   npm run bench -- --prompts benchmarks/prompts.json --out benchmarks/results/run.json
 *   npm run bench -- --mock                         # simulated backends, no keys/network (CI)
 *
 * Keys come from env: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, GROQ_API_KEY,
 * DEEPSEEK_API_KEY. Base URLs: OLLAMA_BASE_URL, LMSTUDIO_BASE_URL, CUSTOM_BASE_URL.
 *
 * Metrics per model (medians over all prompts × runs unless stated):
 *   TTFT        time to first token
 *   latency     request start → stream end
 *   tok/s       output tokens / decode time (first → last token)
 *   out tokens  mean output tokens (provider-reported where available)
 *   cost        summed USD from the model price table (src/services/models.ts)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { streamChat } from "../src/services/llm";
import { getModelById, PRICING_SOURCES } from "../src/services/models";
import type { LLMProviderType, MessageTelemetry, ModelConfig } from "../src/types/llm";

interface Target { provider: LLMProviderType; modelId: string; label: string }
interface Sample { prompt: string; run: number; ok: boolean; error?: string; telemetry?: MessageTelemetry; chars: number }

const DEFAULT_PROMPTS = [
    "In two sentences, explain what a Server-Sent Events stream is.",
    "Write a TypeScript function that debounces another function. Code only.",
    "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much is the ball? Answer briefly.",
];

const ENV_KEYS: Partial<Record<LLMProviderType, string>> = {
    openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY",
    groq: "GROQ_API_KEY", deepseek: "DEEPSEEK_API_KEY", custom: "CUSTOM_API_KEY",
};
const ENV_BASE: Partial<Record<LLMProviderType, string>> = {
    ollama: "OLLAMA_BASE_URL", lmstudio: "LMSTUDIO_BASE_URL", custom: "CUSTOM_BASE_URL",
};

function parseArgs(argv: string[]) {
    const args: Record<string, string | boolean> = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--")) continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) args[key] = true;
        else { args[key] = next; i++; }
    }
    return args;
}

function parseTarget(spec: string): Target {
    const i = spec.indexOf(":");
    if (i < 1) throw new Error(`Invalid target "${spec}". Use provider:model, e.g. groq:openai/gpt-oss-20b`);
    const provider = spec.slice(0, i) as LLMProviderType;
    const modelId = spec.slice(i + 1);
    return { provider, modelId, label: `${provider}:${modelId}` };
}

const median = (xs: number[]) => {
    if (!xs.length) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const p90 = (xs: number[]) => {
    if (!xs.length) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)];
};
const fmt = (n: number, digits = 0) => (Number.isFinite(n) ? n.toFixed(digits) : "–");

async function runOne(target: Target, prompt: string): Promise<Omit<Sample, "prompt" | "run">> {
    const config: ModelConfig = {
        provider: target.provider,
        modelId: target.modelId,
        temperature: 0,
        baseUrl: ENV_BASE[target.provider] ? process.env[ENV_BASE[target.provider]!] : undefined,
    };
    const apiKey = ENV_KEYS[target.provider] ? process.env[ENV_KEYS[target.provider]!] ?? "" : "";
    try {
        const res = await streamChat(
            [{ id: "bench", role: "user", content: prompt, timestamp: Date.now() }],
            config, apiKey, () => undefined, AbortSignal.timeout(120_000)
        );
        return { ok: true, telemetry: res.telemetry, chars: res.content.length };
    } catch (err) {
        return { ok: false, error: (err as Error).message, chars: 0 };
    }
}

function summarize(target: Target, samples: Sample[]) {
    const ok = samples.filter(s => s.ok && s.telemetry);
    const t = ok.map(s => s.telemetry!);
    const ttft = t.map(x => x.ttftMs ?? NaN).filter(Number.isFinite);
    const lat = t.map(x => x.durationMs ?? NaN).filter(Number.isFinite);
    const tps = t.map(x => x.tokPerSec ?? NaN).filter(x => Number.isFinite(x) && x > 0);
    const out = t.map(x => x.tokens ?? 0);
    return {
        target: target.label,
        runs: samples.length,
        errors: samples.length - ok.length,
        ttftMedianMs: median(ttft), ttftP90Ms: p90(ttft),
        latencyMedianMs: median(lat), latencyP90Ms: p90(lat),
        tokPerSecMedian: median(tps),
        outputTokensMean: out.length ? out.reduce((a, b) => a + b, 0) / out.length : NaN,
        totalCostUsd: t.reduce((a, x) => a + (x.cost ?? 0), 0),
        usageSource: t.every(x => x.usageSource === "provider") ? "provider" : t.some(x => x.usageSource === "provider") ? "mixed" : "estimated",
        firstError: samples.find(s => !s.ok)?.error,
    };
}

// ---------------------------------------------------------------------------
// --mock: simulated backends so the script (and its parsing/accounting path)
// can be exercised without keys. Numbers are synthetic and labelled as such.
// ---------------------------------------------------------------------------
function installMockFetch() {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const enc = new TextEncoder();
    const words = "Server-Sent Events keep one HTTP response open and push text/event-stream frames as tokens are generated .".split(" ");

    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        const local = url.includes("localhost:11434");
        const ttft = local ? 120 : 260;
        const perToken = local ? 22 : 4; // ≈45 tok/s locally vs ≈250 tok/s on an LPU
        const n = 24;
        const body = new ReadableStream<Uint8Array>({
            async start(c) {
                await sleep(ttft);
                for (let i = 0; i < n; i++) {
                    const w = words[i % words.length] + " ";
                    c.enqueue(enc.encode(local
                        ? JSON.stringify({ message: { content: w }, done: false }) + "\n"
                        : `data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`));
                    await sleep(perToken);
                }
                c.enqueue(enc.encode(local
                    ? JSON.stringify({ message: { content: "" }, done: true, prompt_eval_count: 21, eval_count: n }) + "\n"
                    : `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 21, completion_tokens: n } })}\n\ndata: [DONE]\n\n`));
                c.close();
            },
        });
        return new Response(body, { status: 200, headers: { "content-type": local ? "application/x-ndjson" : "text/event-stream" } });
    }) as typeof fetch;
    process.env.GROQ_API_KEY ||= "mock-key";
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const mock = Boolean(args.mock);
    if (mock) installMockFetch();

    const a = parseTarget(String(args.a ?? "ollama:llama3.2"));
    const b = parseTarget(String(args.b ?? "groq:openai/gpt-oss-20b"));
    const runs = Math.max(1, Number(args.runs ?? 3));
    const prompts: string[] = args.prompts ? JSON.parse(readFileSync(String(args.prompts), "utf8")) : DEFAULT_PROMPTS;

    console.log(`\nPrivAI benchmark${mock ? " (MOCK — synthetic numbers)" : ""}`);
    console.log(`A = ${a.label}   B = ${b.label}   prompts = ${prompts.length}   runs = ${runs}\n`);

    const samples: Record<string, Sample[]> = { [a.label]: [], [b.label]: [] };
    for (const [pi, prompt] of prompts.entries()) {
        for (let run = 0; run < runs; run++) {
            // Alternate order so neither side always benefits from a warm connection / cache.
            const order = run % 2 === 0 ? [a, b] : [b, a];
            for (const t of order) {
                const r = await runOne(t, prompt);
                samples[t.label].push({ prompt, run, ...r });
                const tel = r.telemetry;
                process.stdout.write(r.ok
                    ? `  p${pi + 1} r${run + 1} ${t.label.padEnd(36)} ttft ${fmt(tel?.ttftMs ?? NaN).padStart(5)}ms  ${fmt(tel?.tokPerSec ?? NaN, 1).padStart(6)} tok/s  ${tel?.tokens} tok\n`
                    : `  p${pi + 1} r${run + 1} ${t.label.padEnd(36)} ERROR ${r.error}\n`);
            }
        }
    }

    const rows = [summarize(a, samples[a.label]), summarize(b, samples[b.label])];
    const table = [
        "| Model | TTFT p50 / p90 (ms) | Latency p50 / p90 (ms) | tok/s p50 | Out tokens (mean) | Total cost (USD) | Usage | Errors |",
        "|---|---|---|---|---|---|---|---|",
        ...rows.map(r => `| \`${r.target}\` | ${fmt(r.ttftMedianMs)} / ${fmt(r.ttftP90Ms)} | ${fmt(r.latencyMedianMs)} / ${fmt(r.latencyP90Ms)} | ${fmt(r.tokPerSecMedian, 1)} | ${fmt(r.outputTokensMean, 0)} | $${r.totalCostUsd.toFixed(6)} | ${r.usageSource} | ${r.errors}/${r.runs} |`),
    ].join("\n");
    console.log(`\n${table}\n`);

    for (const t of [a, b]) {
        const m = getModelById(t.modelId);
        const src = PRICING_SOURCES[t.provider as keyof typeof PRICING_SOURCES];
        if (m?.isLocal) console.log(`  ${t.label}: local — $0`);
        else if (!m) console.log(`  ${t.label}: not in price table — cost reported as $0`);
        else if (src) console.log(`  ${t.label}: $${(m.costPer1kInput! * 1000).toFixed(3)} in / $${(m.costPer1kOutput! * 1000).toFixed(3)} out per 1M — ${src.url} (as of ${src.asOf}${src.verified ? "" : ", unverified"})`);
    }
    for (const r of rows) if (r.firstError) console.log(`  ${r.target} first error: ${r.firstError}`);

    const out = resolve(String(args.out ?? `benchmarks/results/${new Date().toISOString().replace(/[:.]/g, "-")}${mock ? "-mock" : ""}.json`));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), mock, runs, prompts, summary: rows, samples }, null, 2));
    console.log(`\nRaw samples → ${out}`);

    if (rows.every(r => r.errors === r.runs)) process.exitCode = 1;
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
