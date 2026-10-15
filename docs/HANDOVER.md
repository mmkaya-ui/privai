# PrivAI — Engineering handover

Last verified: 2026-10-15, branch `fix/verified-claims` (based on `9dd3a90`).
This replaces the earlier handover. That document described a provider interface, error codes, file
paths and a proxy routing that the code did not have. Everything below was checked against the code
or by running a command. See [VERIFICATION.md](VERIFICATION.md) for how.

## 1. What the app is

- **Overall:** a Next.js 16 (App Router, React 19) single page with a Serwist service worker. Chat
  calls go from the tab directly to the chosen provider using the user's key. There is no
  application database.
- **Storage:** IndexedDB database **`privai-db`** (version 1) with stores `sessions` (key `id`,
  index `by-date` on `updatedAt`) and `settings` (keys `apiKeys`, `customBaseUrls`, `theme`,
  `textSize`, `defaultModelConfig`, `discoveredOllamaModels`). **Nothing in it is encrypted.**
  There are no prompt templates.
- **Encryption:** only the `.privai` export, in `src/services/crypto.ts` (AES-256-GCM,
  PBKDF2-SHA256 600k, metadata bound as AAD).
- **`/api/proxy`:** an Edge route with an SSRF guard (`src/lib/proxy-guard.ts`). **Nothing in the
  client calls it.** All five cloud providers accept direct browser calls (probe on 2026-10-15).

## 2. Layout (files that matter)

```
src/
  app/                layout.tsx (self-hosted Inter via @fontsource-variable/inter), page.tsx, sw.ts, api/proxy/route.ts
  components/         ChatArea (send/edit/stream), InputArea, MessageBubble, ModelSelector, SettingsModal,
                      Sidebar, CommandPalette, ArenaView, ArtifactCanvas, CodeBlock, ErrorBoundary
  lib/                store.tsx (React context + IndexedDB sync), persistence.ts, proxy-guard.ts
  services/
    llm.ts            provider registry + streamChat (TTFT, tok/s, cost; provider usage or chars/4 fallback)
    llm-core.ts       LLMError, providerFetch, readLines / readSSE / readNDJSON
    openai.ts         createOpenAICompatibleProvider → OpenAI, Groq, DeepSeek, Custom, (LM Studio via ollama.ts)
    anthropic.ts      gemini.ts   ollama.ts   webllm.ts
    history.ts        buildPromptHistory: what the model actually receives
    attachments.ts    PDF (pdf.js) / DOCX (fflate) / text extraction; refuses images and binaries
    rag.ts            chunking, TF-IDF ranking, opening-chunk fallback, prompt wording
    models.ts         catalog, prices (+ PRICING_SOURCES), estimateCost, formatCost
    crypto.ts         storage.ts
  types/llm.ts        Message, ChatSession, ModelConfig, Attachment, LLMProvider, LLMStreamEvent, LLMErrorCode
e2e/                  Playwright: privai.spec.ts (regressions), features.spec.ts, fixtures/      docs/verification/  evidence files
```

There is no `src/types/chat.ts`. `next.config.ts` was removed; `next.config.mjs` is the config.
Vitest config is `vitest.config.mts`, with the `node` environment by default (ErrorBoundary's test
opts into jsdom).

## 3. Contracts

```ts
interface LLMProvider {
  readonly id: LLMProviderType;          // 'openai'|'anthropic'|'gemini'|'deepseek'|'groq'|'ollama'|'lmstudio'|'webllm'|'custom'
  readonly name: string;
  readonly isLocal: boolean;
  readonly requiresApiKey: boolean;
  stream(messages: Message[], config: ModelConfig, apiKey: string, signal?: AbortSignal):
    AsyncGenerator<{ type: 'token'; text: string } | { type: 'usage'; usage: Partial<{ inputTokens: number; outputTokens: number }> }>;
}
type LLMErrorCode = 'auth'|'rate_limit'|'network'|'aborted'|'bad_request'|'not_found'|'server'|'unsupported'|'unknown';
```

- **Errors:** `LLMError` also carries `provider`, `status`, `retryable` (rate_limit / server /
  network) and `retryAfterMs`. An aborted request has `name === 'AbortError'`.
- **`Message.status`:** `'error' | 'notice'` turns are shown in the chat but never sent to a model.
  `'stopped'` marks a partial reply the user stopped; it is kept.
- **History sent to the model:** always go through `buildPromptHistory()`, never raw
  `session.messages`.

## 4. Verified status (commands run 2026-10-15, Node 22.22, Chromium 141)

| Check | Result |
| :--- | :--- |
| `npm run lint`, `npm run typecheck` | clean |
| `npm run test:coverage` | 13 files, 304 tests passed; 91.3% statements · 86.3% branches · 92.6% functions · 91.3% lines (thresholds 90/85/90/90 enforced) |
| `npm run build` | passes with no access to Google Fonts; `/` static, `/api/proxy` Edge |
| `npm run bench -- --mock --runs 2` | runs |
| `npm run test:e2e` | 17 passed (`privai.spec.ts` 10 + `features.spec.ts` 7). `privai.spec.ts` on `9dd3a90`: 7 of 10 failed |
| `npm run ci` | exit 0; matches `.github/workflows/ci.yml`, which also runs the end-to-end tests |

## 5. What changed in this branch (each reproduced by a failing test first)

1. **Privacy copy.** It claimed encrypted keys and chats, "100% on-device" for cloud prompts, and
   "zero bytes transmitted" inside prompts that do send excerpts. It now states what happens.
2. **History.** Error text and empty or stopped turns were sent back to the model as assistant
   turns. Now `buildPromptHistory` filters them, and also handles messages saved by older builds.
3. **Persistence.** Only the chat on screen was saved, so a reply that finished after switching
   chats was lost. Now every changed chat is saved (`sessionsNeedingSave`).
4. **PDF.** The old code scanned raw bytes for readable text, which finds nothing in compressed
   PDFs. Now it uses pdf.js (`pdfjs-dist` 5.4, worker bundled locally, `isEvalSupported: false`).
5. **DOCX.** These were read as text (zip garbage). Now they are extracted with `fflate`.
6. **Images and binaries.** These were decoded as text. Now they are refused with a visible
   "not sent: …" label.
7. **"Summarize this" with no matching terms.** The document was silently dropped. Now the opening
   chunks of each file are sent.
8. **Ollama "Test Connection".** It said models would appear in the picker; they never did. Now
   they are stored in `discoveredOllamaModels` and shown.
9. **Build.** It failed without Google Fonts access. Now Inter is self-hosted from npm.
10. **Cost display.** It showed `$0.0000` for small non-zero costs, a hard-coded
    "(Saved ~98% vs $20/mo)" badge, and a stray `0` rendered from `tokPerSec && …`. Now
    `formatCost` handles small costs, the badge is gone, the falsy-zero rendering is fixed, and
    estimated costs are labelled "(est.)".
11. **Prices.** All prices were rechecked on the official pages. `deepseek-chat` and
    `deepseek-reasoner` (no longer listed) were replaced by `deepseek-flash` and `deepseek-v4-pro`
    (peak rates), and the moved Anthropic and OpenAI docs URLs were updated.
12. **Command palette.** It cleared its search box 20 ms after opening, erasing anything typed straight
    after `Ctrl+K` (found by GitHub CI). It is now mounted fresh on each open, with no delayed reset.
13. **Tooling.**
    - Coverage thresholds are now real (the old handover claimed a 90% assertion that didn't exist).
    - `npm run ci` now matches the workflow.
    - Added `npm run test:e2e` and `npm run verify`.
    - On CI, Playwright failures show up as PR annotations.
    - `engines.node` is `>=20.16` (required by pdfjs-dist).

## 6. Watch-outs

- **ES2017 target:** don't use the regex `/s` flag; use `[\s\S]`.
- **Gemini keys:** go in the `x-goog-api-key` header, never `?key=`.
- **Webpack build:** must stay `next build --webpack`, because Serwist's plugin is webpack-only.
- **pdf.js:** loaded lazily from `pdfjs-dist/legacy/build/pdf.mjs`. The worker URL is resolved with
  `new URL(…, import.meta.url)`, so webpack bundles it (no CDN). The "no third-party requests"
  e2e test will fail if that regresses.
- **RAG description:** in-memory TF-IDF. Don't describe it as embeddings or a vector database.
- **The proxy:** don't describe it as part of the Groq/DeepSeek path unless the client actually
  starts calling it.

## 7. Open items (not done, not claimed)

- Keys at rest are unencrypted. A possible improvement is an optional passphrase-locked vault.
- No vision (images) and no OCR for scanned PDFs.
- Real-key smoke tests against each provider (e.g. a manual workflow with secrets).
- Not automated: WebLLM on a real GPU, theme switching, "clear chat", copy/download buttons.
