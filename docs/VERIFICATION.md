# Verification guide

How every claim in the README was checked, and how to reproduce it. Evidence files are in
[`docs/verification/`](verification/).

## 1. Automated (re-run any time)

```bash
npm ci
npm run ci                       # lint, typecheck, unit tests with enforced coverage, build, mock benchmark
npx playwright install chromium  # once (or: export PW_CHROMIUM_PATH=/path/to/chromium)
npm run test:e2e                 # needs the build from `npm run ci`
```

### End-to-end suite (`e2e/privai.spec.ts`)
These tests run the production build in Chromium. Provider endpoints are intercepted with
`page.route`, so the tests read exactly what the app would send, and what it writes to IndexedDB,
without using real keys.

| Test | What it proves | On `9dd3a90` | Now |
| :--- | :--- | :---: | :---: |
| privacy copy matches what is actually stored and sent | The key really is plain text in IndexedDB, and no UI text claims keys, chats or storage are encrypted or that cloud prompts stay on-device | ✘ | ✓ |
| failed / empty assistant turns are not sent back to the model | Old-format error turns and empty (stopped) turns are filtered out of the request | ✘ | ✓ |
| a reply that finishes after switching chats is saved | Chat A's reply is written to IndexedDB even though chat B is on screen | ✘ | ✓ |
| PDF attachment | Text from a LibreOffice PDF with Flate-compressed streams ("4,750 euros") is in the prompt, and the prompt doesn't claim "zero bytes transmitted" | ✘ | ✓ |
| DOCX attachment | Paragraph text ("three days per week") is in the prompt | ✘ | ✓ |
| image attachment | No PNG bytes in the prompt, and a visible "not sent" notice | ✘ | ✓ |
| encrypted .privai backup round-trips | Export → file has no plaintext, v2 / 600k iterations → wipe → import restores the chat | ✓ | ✓ |
| no analytics or third-party requests | Every request goes to the app's own host or `api.groq.com`, including the pdf.js worker | ✓ | ✓ |
| Ollama "Test Connection" | Installed models appear in the picker after a reload, and the chat goes to `localhost:11434/api/chat` | ✘ | ✓ |
| works offline after the first visit | With the network disabled, a reload still renders the app from the service worker | ✓ | ✓ |

### Feature suite (`e2e/features.spec.ts`)
These cover the rest of what the README describes. All of them pass on this branch (7 tests).

| Test | What it proves |
| :--- | :--- |
| Stop before the first token | Pressing Stop shows "Stopped before the model replied."; the next request has one merged user turn and no empty assistant turn |
| Edit a sent prompt | The edited text is what gets sent; the branch counter shows 2 / 2, and "Previous branch" brings back the original |
| Arena | Groq and Anthropic stream side by side; cost comes from Anthropic's reported usage (shown as `<$0.0001`) |
| Command palette | `Ctrl+K` → a chat title opens that chat; "Export Chat to Markdown" downloads `beta-plans.md` with the messages |
| Command palette keeps what you type immediately after Ctrl+K | Text typed straight after opening is kept. This failed 3/3 before the fix, because the palette cleared its box 20 ms after opening; found when GitHub CI's faster typing lost the query |
| Code block → Canvas | The iframe has `sandbox="allow-scripts allow-modals"` (no same-origin) and renders the HTML |
| LM Studio | The request goes to `http://localhost:1234/v1/chat/completions` with `model: local-model`; the UI says "Runs on this device" and "On this device" |

Logs: [`e2e-before-9dd3a90.log`](verification/e2e-before-9dd3a90.log) (original code, same test file)
and [`e2e-after.log`](verification/e2e-after.log). The only change made to the original checkout for
the "before" run was stubbing `next/font/google`, because that build fails without access to Google
Fonts ([`build-before-9dd3a90.log`](verification/build-before-9dd3a90.log)).

### Unit tests added for the fixes
- **`src/services/__tests__/attachments.test.ts`:** real PDF, DOCX and PNG fixtures, plus edge
  cases. The PDF test first asserts that the target text is *not* present in the raw bytes, which is
  why the old byte-scanner could not find it.
- **`src/services/__tests__/history.test.ts`:** error, notice and empty turns are filtered; turns
  are trimmed to the last N, start with the user, and adjacent same-role turns are merged.
- **`src/lib/persistence.test.ts`:** every changed chat is saved, not only the one on screen.
- **`src/services/__tests__/rag.test.ts`:** falls back to the start of each document when nothing
  matches; checks the prompt wording.
- **`src/services/__tests__/models.test.ts`:** `formatCost` never shows `$0.0000` for a non-zero
  cost; discovered Ollama models appear in the list; every pricing source is marked verified.

### Coverage thresholds are real
`vitest.config.mts` sets `thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 }`.
To see that they are enforced, raise one to 99 and run `npm run test:coverage`. It exits 1 with
`ERROR: Coverage for statements (…) does not meet global threshold (99%)`.

## 2. Manual checks (dated; re-run when they matter)

### Provider CORS: [`cors-probe-2026-10-15.json`](verification/cors-probe-2026-10-15.json)
- **Method:** paste [`scripts/cors-probe.browser.js`](../scripts/cors-probe.browser.js) into the
  DevTools console of any `https://` page. It sends one request per provider with PrivAI's real
  headers and an **invalid** key.
- **Reading the result:** `corsReadable: true` means the browser let the page read the provider's
  401/400 response, so direct browser calls work.
- **Result on 2026-10-15 (Chrome 152):** all five providers returned `true`.

### Prices: [`pricing-2026-10-15.md`](verification/pricing-2026-10-15.md)
Each official pricing page was opened in a browser (some are rendered client-side) and compared
with `src/services/models.ts`. The DeepSeek IDs `deepseek-chat` and `deepseek-reasoner` are no
longer listed, so they were replaced by `deepseek-flash` and `deepseek-v4-pro`.

## 3. Test fixtures

`e2e/fixtures/` and `src/services/__tests__/fixtures/` hold the same three files:

| File | Made with | Contents |
| :--- | :--- | :--- |
| `contract.pdf` | `soffice --headless --convert-to pdf contract.txt` (LibreOffice) | Short agreement text; streams are FlateDecode-compressed |
| `handbook.docx` | `soffice --headless --convert-to docx handbook.txt` | Short handbook text |
| `photo.png` | Pillow, 320×200 | A rectangle (no text) |

## 4. Not verified

- **WebLLM on a real GPU:** headless Chromium has no WebGPU. `webllm.test.ts` covers the provider
  against a mocked engine.
- **Theme switching, "clear chat", copy/download buttons:** not automated.
- **Real model replies:** these need real API keys. The tests check what is sent, not how a provider
  responds to it.
- **`deepseek-chat` as an alias:** whether DeepSeek still accepts it needs a valid key.
- **Local Network Access prompts:** Chrome may ask before a page served from a non-localhost origin
  can reach `http://localhost:11434`. This was not tested.
- **The sample Ollama benchmark:** `benchmarks/results/local-ollama-sample.json` is one recorded
  run on the author's hardware.
