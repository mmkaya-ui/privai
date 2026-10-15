# PrivAI — Zero-Telemetry Client-Side AI Workspace

A zero-telemetry, developer-grade AI workspace running directly in your browser. PrivAI connects directly to commercial LLM inference APIs (OpenAI, Anthropic, DeepSeek, Groq, Google Gemini) and local hardware (Ollama, LM Studio, in-browser WebGPU) with **no application server, no middleman database, and zero tracking**.

---

## The Problem PrivAI Solves

### 1. The $720/Year Subscription Trap vs. Wholesale Token Pricing
Commercial web interfaces bundle models behind fixed **$20/month subscriptions** (ChatGPT Plus, Claude Pro, Gemini Advanced). Maintaining access across ecosystems easily totals **$60/month ($720/year)**.

- **Wholesale BYOK Reality:** When using raw developer APIs directly, costs are billed per token:
  - **Claude Haiku 5.5:** ~$0.10 per 1,000,000 input tokens
  - **DeepSeek V3:** ~$0.14 per 1,000,000 input tokens
  - **Groq GPT-OSS 20B:** ~$0.075 per 1,000,000 input tokens
- An active developer or researcher typically consumes **$1.50 to $3.00/month** in tokens for the exact same foundation models—saving **~95% to 98%**. PrivAI displays this telemetry live under each message.

### 2. The Middleman Database Vulnerability
Most open-source or self-hosted AI clients (LibreChat, Open WebUI, web chat wrappers) require an application backend and database (Node.js, PostgreSQL, MongoDB, Supabase).
- If that server or database is compromised, **every plaintext prompt, proprietary source file, and API key is exposed**.
- **PrivAI has no application server.** It is a static Progressive Web App (PWA). All chat sessions, API keys, and configurations are stored in your browser's private IndexedDB (`idb`) and can be exported as an encrypted `.privai` backup file protected with **AES-256-GCM** using a master passphrase.

### 3. Document Privacy in Retrieval (RAG)
When you upload a confidential contract, financial statement, or private code to consumer web chats, the entire file is transmitted to cloud storage and processed through cloud vector pipelines.
- **PrivAI In-Browser Document Retrieval:** Documents (PDFs, Markdown, source code) are parsed, chunked, and indexed locally inside the browser tab using an in-memory TF-IDF cosine similarity engine.
- **0 bytes of the raw document leave your computer.** Only the specific matching snippets needed to answer the immediate prompt are injected into the context sent to your chosen inference endpoint.

---

## Architecture & Data Boundaries

```mermaid
flowchart TD
    subgraph Client_Boundary ["Client Security Boundary (Your Machine)"]
        UI["PrivAI Next.js 16 PWA Client"]
        IDB[("Local IndexedDB (idb)\nSessions, Settings, Keys")]
        LocalRAG["In-Memory Document RAG Engine\n(TF-IDF Cosine Similarity)"]
        CryptoService["Web Crypto API\n(AES-256-GCM + PBKDF2 600k)"]

        UI <--> IDB
        UI <--> LocalRAG
        UI <--> CryptoService
    end

    subgraph Direct_Inference ["Direct Client-to-Provider Inference"]
        UI -->|Direct HTTPS Stream + Browser Header| Anthropic["Anthropic API"]
        UI -->|Direct HTTPS Stream| OpenAI["OpenAI / Custom Base URLs"]
        UI -->|Direct HTTPS Stream (Header Auth)| Gemini["Google Gemini API"]
        UI -->|Localhost IPC / Zero Internet Traffic| Ollama["Local Ollama / LM Studio (11434 / 1234)"]
        UI -->|In-Tab WebGPU / Zero Network Packets| WebLLM["WebLLM (Llama 3.2 / Gemma 2)"]
    end

    subgraph Guarded_Proxy ["Optional SSRF-Guarded Edge Relay (/api/proxy)"]
        UI -->|Stateless CORS Forwarding| Proxy["Next.js Edge Proxy\n(Strict Host Allowlist + Private IP Block)"]
        Proxy -->|Direct HTTPS Stream| Groq["Groq API"]
        Proxy -->|Direct HTTPS Stream| DeepSeek["DeepSeek API"]
    end
```

### Data Boundary Breakdown

| Data Asset | Traditional Web Chat (ChatGPT / Claude) | Standard Self-Hosted (LibreChat / Open WebUI) | PrivAI Workspace |
| :--- | :--- | :--- | :--- |
| **Chat History Storage** | Vendor Cloud Database | Middleman Database (Postgres / Mongo) | **Local IndexedDB (Your Browser Only)** |
| **API Keys & Passphrases** | Stored on Vendor Servers | Stored on App Server Database | **Client-side only (IndexedDB / Memory)** |
| **Document Uploads (RAG)** | Transmitted to Cloud Vector DB | Transmitted to App Server Embedding Pipeline | **0 Bytes Uploaded (Parsed & Ranked in Tab Memory)** |
| **Telemetry & Analytics** | Active (Mixpanel, Datadog, Internal Trackers) | Varies (Docker server logs all user requests) | **0% (Zero analytics SDKs, zero telemetry logs)** |
| **Model Training on Prompts** | Opt-out required on consumer web tiers | Dependent on keys used | **Excluded by default via Commercial API Terms** |
| **Air-Gapped / Offline Use** | Impossible | Requires running full Docker container stack | **Supported out-of-the-box (Localhost & WebGPU)** |

---

## Threat Model & Security

PrivAI is engineered around client data sovereignty. Security properties and trade-offs are explicitly outlined below:

### What Is Stored
- **Browser IndexedDB:** Chat sessions, conversation trees, prompt templates, and UI preferences are stored in the client browser's IndexedDB (`idb` database named `privai`).
- **API Keys:** BYOK keys entered into Settings are saved in IndexedDB / client state so they persist across sessions.
- **Encrypted Backups (`.privai`):** When you export your data, the backup is encrypted with **AES-256-GCM** using a key derived from your passphrase via **PBKDF2-HMAC-SHA256** (600,000 iterations, per-export random 16-byte salt, random 12-byte IV, and header AAD verification).
- **Server Persistence:** The PrivAI deployment contains **no database**, no session cookies, and zero server-side storage.

### Where API Keys Live
- API keys **never leave your client machine** except when dispatched as authorization headers to the upstream model provider you explicitly query.
- For providers supporting direct browser CORS (Anthropic via `"anthropic-dangerous-direct-browser-access": "true"`, OpenAI-compatible servers with CORS, local Ollama, and LM Studio), requests travel directly from browser to provider without touching any intermediate server.
- For providers requiring server-side CORS translation, requests pass through the optional stateless `/api/proxy` route. The proxy never writes keys to disk or logs them.

### What the `/api/proxy` Route Does and Does NOT Protect

#### What `/api/proxy` DOES Protect Against:
1. **SSRF (Server-Side Request Forgery) & Internal Pivoting:**
   - Enforces a strict hostname allowlist (`ALLOWED_TARGET_HOSTS`: `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.groq.com`, `api.deepseek.com`, etc.) using parsed exact domain or subdomain matching.
   - Enforces `https:` scheme in production.
   - In production (`NODE_ENV=production`), strictly blocks loopback (`127.0.0.0/8`, `::1`), private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`), carrier-grade NAT (`100.64.0.0/10`), link-local / cloud IMDS (`169.254.0.0/16`, `169.254.169.254`, `fe80::/10`), multicast, and broadcast addresses. Localhost is permitted only in development mode to support local Ollama/LM Studio forwarding.
2. **Open Relay Abuse & Origin Locking:**
   - Validates the incoming `Origin` / `Referer` header against the application's own origin (`request.nextUrl.origin`), returning `403 Forbidden` if mismatched. Third-party sites cannot use your proxy.
3. **Header Sanitization:**
   - Strips hop-by-hop headers (`host`, `cookie`, `set-cookie`, `authorization` overrides, `connection`, `transfer-encoding`) before proxying to upstream services.
4. **Body Capping & Memory Exhaustion:**
   - Enforces a 1 MiB body size cap (`MAX_REQUEST_BODY_BYTES = 1024 * 1024`) via a counting stream limiter, returning `413 Payload Too Large` immediately if exceeded.
5. **Redirect Hijacking:**
   - Configured with `redirect: "manual"` so malicious 3xx redirects to internal infrastructure are never followed.
6. **Defensive Response Headers:**
   - Emits `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.

#### What `/api/proxy` DOES NOT Protect Against:
- **Upstream Provider Snooping:** The proxy forwards your prompt and API key to the upstream provider (e.g. OpenAI or Anthropic). You rely on that provider's commercial data policy.
- **Client-Side Compromise:** If your browser or machine is compromised by malicious extensions or malware, local IndexedDB data and memory can be inspected.
- **Network Metadata Visibility:** While payload transit is encrypted via TLS, your hosting infrastructure (e.g., Vercel, Cloudflare, or self-hosted server) can observe outbound network IP destinations.

---

## How In-Browser Document Retrieval (RAG) Works

PrivAI implements a lightweight, high-speed document retrieval pipeline in [`src/services/rag.ts`](file:///d:/antigravity/privai/src/services/rag.ts) designed for zero-latency, zero-leak document Q&A:

```
[User drops PDF/TXT/MD/Code]
          │
          ▼
Text Extraction (Client Thread: pdfjs-dist / TextDecoder)
          │
          ▼
Sliding-Window Chunking (~600 chars, 100-char overlap, boundary-aware)
          │
          ▼
In-Memory Vocabulary & TF-IDF Vector Matrix Construction
          │
          ▼
Cosine Similarity Ranking vs. User Query Vector
          │
          ▼
Top-K Relevant Chunks Formatted & Injected into LLM Prompt Context
```

### Technical Design Truth:
- **No Heavy Neural Embeddings:** PrivAI does **NOT** download a 200MB+ BERT/sentence-transformers model to the browser, nor does it make calls to OpenAI/Cohere embedding APIs.
- **No Vector DB in IndexedDB:** Documents and embeddings are **NOT** persisted into an IndexedDB vector database. Everything lives transiently in memory for the duration of the query session.
- **Why TF-IDF?**
  1. **Instantaneous:** Zero model load time; sub-millisecond scoring across hundreds of chunks.
  2. **100% Private:** Raw document text never leaves the client thread. Only the top-ranked relevant excerpts are forwarded to the LLM.
  3. **Zero Cost:** No embedding token fees.

---

## Wholesale Token Economics (Prices as of October 2026)

Why pay $20/month for a single ecosystem when developer API rates provide direct access to state-of-the-art models for pennies?

| Provider | Model | Input $/1M tokens | Output $/1M tokens | Official Source |
| :--- | :--- | :--- | :--- | :--- |
| **Anthropic** | Claude Sonnet 5.5 | **$2.00** | **$10.00** | [Anthropic Pricing](https://www.anthropic.com/pricing#api) |
| **Anthropic** | Claude Haiku 5.5 | **$0.10** | **$0.50** | [Anthropic Pricing](https://www.anthropic.com/pricing#api) |
| **Anthropic** | Claude Opus 5.5 | **$4.00** | **$20.00** | [Anthropic Pricing](https://www.anthropic.com/pricing#api) |
| **Google** | Gemini 3.8 Flash | **$0.75** | **$3.75** | [Gemini Pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| **Google** | Gemini 3.1 Flash-Lite | **$0.25** | **$1.50** | [Gemini Pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| **Google** | Gemini 3.1 Pro | **$2.00** | **$12.00** | [Gemini Pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| **Groq** | OpenAI GPT-OSS 20B | **$0.075** | **$0.30** | [Groq Pricing](https://groq.com/pricing) |
| **Groq** | OpenAI GPT-OSS 120B | **$0.15** | **$0.60** | [Groq Pricing](https://groq.com/pricing) |
| **DeepSeek** | DeepSeek V3 (`deepseek-chat`) | **$0.14** | **$0.28** | [DeepSeek Pricing](https://api-docs.deepseek.com/quick_start/pricing) |
| **DeepSeek** | DeepSeek R1 (`deepseek-reasoner`) | **$0.55** | **$2.19** | [DeepSeek Pricing](https://api-docs.deepseek.com/quick_start/pricing) |
| **Localhost** | Ollama (Llama 3.2, Qwen 3, Mistral) | **$0.00** | **$0.00** | Local hardware / 100% free |
| **WebGPU** | WebLLM (In-Browser Llama 3.2 / Gemma 2) | **$0.00** | **$0.00** | Local GPU / 100% free |

*Note: Prices verified as of October 2026. Consult official vendor pricing documentation linked above for current rates.*

---

## Local Benchmarking & Model Arena

PrivAI includes automated benchmarking tools to measure real-world inference performance across providers.

### 1. Head-to-Head CLI Benchmark (`scripts/benchmark.ts`)
Run repeatable automated benchmarks across any two configured models:

```bash
# Smoke test with synthetic mock streams (no API keys required, runs in CI):
npm run bench -- --mock --runs 2

# Compare local Ollama against Groq LPU inference:
npm run bench -- --modelA ollama:llama3.2 --modelB groq:openai/gpt-oss-20b --runs 3

# Compare Anthropic Claude Sonnet 5.5 vs. DeepSeek R1:
npm run bench -- --modelA anthropic:claude-sonnet-5-5 --modelB deepseek:deepseek-reasoner --runs 3
```

**Metrics Measured:**
- **Time-to-First-Token (TTFT):** Median (p50) and 90th percentile (p90) latency before initial streaming token arrives.
- **Total Latency:** End-to-end request duration.
- **Generation Speed:** Active tokens per second (`outputTokens / streamingDuration`).
- **Wholesale Cost:** Exact cost calculated from token counts and October 2026 pricing tables.
- **Output Artifacts:** Results are printed as a markdown table and saved as timestamped JSON in `benchmarks/results/`.

### 2. Multi-Model Battle Arena UI
- Select two models in the in-app Arena view (`Cmd+K` $\to$ Battle Arena).
- Submit a prompt once to stream both models concurrently side-by-side.
- Inspect real-time TTFT, tokens/sec, token counts, and cost telemetry.

---

## Core Capabilities

### Unified LLM Architecture
Every provider implements a single, type-safe `LLMProvider` contract ([`src/types/llm.ts`](file:///d:/antigravity/privai/src/types/llm.ts)):
- **Standardized Streaming:** Universal `stream(request, onChunk, onEvent)` async generator pattern.
- **Robust SSE & NDJSON Parsing:** Handles arbitrary TCP buffer boundaries and mid-JSON chunk splits without dropped characters.
- **Normalized Error Handling:** Consistent `LLMError` codes (`AUTH_INVALID`, `RATE_LIMITED`, `CONTEXT_LENGTH_EXCEEDED`, `SERVICE_UNAVAILABLE`, `CONTENT_FILTERED`, `NETWORK_ERROR`, `ABORTED`).
- **Precise Usage Telemetry:** Accurately extracts provider-reported token usage or falls back to standard heuristic accounting.

### Native Local Machine LLMs (Ollama & LM Studio)
- Native adapter connects directly to `http://localhost:11434` (Ollama) or `http://localhost:1234/v1` (LM Studio).
- Automated connection tester and model auto-discovery with ping latency reporting.
- Operates 100% offline with zero internet packets sent.

### In-Browser WebGPU LLMs (`@mlc-ai/web-llm`)
- Runs lightweight foundation models (`Llama-3.2-1B-Instruct`, `Gemma-2-2B-it`) directly inside the browser tab using WebGPU hardware acceleration.
- No local CLI or Python environment needed. Model weights are cached in browser `CacheStorage` for instant offline inference.
- Native interrupt support via `engine.interruptGenerate()`.

### Linear/Raycast Command Palette (`Cmd+K` / `Ctrl+K`)
- Switch models in one keystroke.
- Full-text search across all IndexedDB conversation history.
- Quick actions: clear context, toggle Battle Arena, export backup, toggle dark/OLED themes.

### Split-Screen Artifacts Canvas & Live Code Sandbox
- Multi-language syntax highlighting powered by Prism (Tokyo Night / GitHub Dark themes).
- 1-click code copying, dynamic file downloading, and an isolated `<iframe>` runner sandbox to execute HTML, JavaScript, and SVG snippets in real time.

### Zero-Knowledge Encrypted Backups (`.privai`)
- Single-click export of your entire IndexedDB database into an encrypted `.privai` file using **AES-256-GCM** with PBKDF2 (600,000 iterations).
- Seamlessly restore conversations on another machine without creating a cloud account.

---

## Limitations

PrivAI prioritizes local data sovereignty and security, which introduces conscious engineering trade-offs:

1. **Browser Memory & Context Bounds:**
   - In-memory document chunking and token processing run on the client JavaScript thread. Ingesting massive files (e.g., 500+ page PDFs) can cause browser tab memory pressure.
2. **Commercial Provider Terms Apply to Cloud Keys:**
   - While PrivAI does not track or store your prompts, when using cloud BYOK keys (OpenAI, Anthropic, Gemini, Groq, DeepSeek), requests are processed by those third-party APIs. Commercial API terms typically exclude training on customer data, but for 100% air-gapped isolation, choose Ollama or WebLLM.
3. **WebGPU Hardware Requirements:**
   - In-browser inference via WebLLM requires a modern browser supporting WebGPU and sufficient unified GPU memory (typically 4GB+ VRAM).
4. **No Centralized Multi-Device Sync:**
   - There is no central server or user database. Chat history is stored locally in your browser. To transfer data across machines, use the encrypted `.privai` backup export/import feature.

---

## Local LLM Setup Guide (Ollama & LM Studio)

PrivAI connects directly to models running locally on your hardware.

### Connecting to Ollama (60-Second Setup)

1. **Install Ollama:** Download from [ollama.com](https://ollama.com) (macOS, Windows, Linux).
2. **Enable Browser CORS:** Since PrivAI runs in your browser, Ollama needs permission to accept browser requests:
   - **macOS / Linux:**
     ```bash
     OLLAMA_ORIGINS="*" ollama serve
     ```
   - **Windows (PowerShell):**
     ```powershell
     $env:OLLAMA_ORIGINS="*"
     ollama serve
     ```
3. **Pull a Model:**
   ```bash
   ollama run llama3.2
   # or DeepSeek R1 reasoning model:
   ollama run deepseek-r1:8b
   ```
4. **Auto-Discovery in PrivAI:** Open PrivAI $\to$ **Settings** $\to$ **Local LLMs** $\to$ click **Test Connection**. PrivAI will detect your local Ollama instance and automatically populate all installed models.

### Connecting to LM Studio / LocalAI

1. Open **LM Studio**, navigate to the **Local Server** tab (`<->`), and click **Start Server** (`http://localhost:1234`).
2. Ensure **CORS** is enabled in the LM Studio server settings.
3. In PrivAI **Settings**, set `http://localhost:1234/v1` as the LM Studio Base URL.

---

## Tech Stack & Verification

- **Framework:** Next.js 16 (App Router), React 19
- **Type Safety:** TypeScript (strict mode, zero `any` policy)
- **Local Database:** IndexedDB via `idb`
- **In-Browser WebGPU:** `@mlc-ai/web-llm`
- **Cryptography:** Web Crypto API (`SubtleCrypto` AES-256-GCM, PBKDF2 600,000 rounds)
- **PWA Service Worker:** `@serwist/next`, `@serwist/sw` (offline precaching)
- **Syntax Engine:** Prism.js

### Running Tests & Quality Checks

PrivAI includes a comprehensive test suite covering cryptographic roundtrips, SSRF protections, provider streaming conformance, mid-chunk SSE assembly, and RAG ranking:

```bash
# Run all unit tests (282 tests across 10 suites)
npm test

# Run tests with code coverage (v8)
npm run test:coverage

# Run TypeScript typecheck
npm run typecheck

# Run ESLint validation
npm run lint

# Run the benchmark smoke test (synthetic mock streams)
npm run bench -- --mock --runs 2

# Run full CI pipeline locally
npm run ci
```

---

## Getting Started

```bash
git clone https://github.com/mmkaya-ui/privai.git
cd privai
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use <kbd>Ctrl+K</kbd> or <kbd>⌘K</kbd> to open the Command Palette, switch models, or open **Settings** to configure Ollama or your BYOK keys.
