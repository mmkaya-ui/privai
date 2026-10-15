// Paste into the DevTools console of any https:// page (e.g. https://example.com).
// Sends one request per cloud provider with PrivAI's real headers and an INVALID key.
// corsReadable:true  -> the browser can read the response, so direct BYOK calls work (no proxy needed).
// corsReadable:false -> the provider blocks browser calls; route it through /api/proxy.
(async () => {
  const K = "invalid-key-cors-probe";
  const probes = [
    ["groq", "https://api.groq.com/openai/v1/chat/completions", { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: "Bearer " + K }, { model: "openai/gpt-oss-20b", messages: [{ role: "user", content: "hi" }], stream: true }],
    ["deepseek", "https://api.deepseek.com/chat/completions", { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: "Bearer " + K }, { model: "deepseek-chat", messages: [{ role: "user", content: "hi" }], stream: true }],
    ["openai", "https://api.openai.com/v1/chat/completions", { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: "Bearer " + K }, { model: "gpt-6-luna", messages: [{ role: "user", content: "hi" }], stream: true }],
    ["anthropic", "https://api.anthropic.com/v1/messages", { "Content-Type": "application/json", "x-api-key": K, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, { model: "claude-haiku-5-5", max_tokens: 16, messages: [{ role: "user", content: "hi" }], stream: true }],
    ["gemini", "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse", { "Content-Type": "application/json", "x-goog-api-key": K }, { contents: [{ role: "user", parts: [{ text: "hi" }] }] }],
  ];
  const out = {};
  for (const [id, url, headers, body] of probes) {
    try {
      const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      out[id] = { corsReadable: true, status: r.status, body: (await r.text()).slice(0, 140) };
    } catch (e) {
      out[id] = { corsReadable: false, error: String(e) };
    }
  }
  console.table(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { corsReadable: v.corsReadable, status: v.status ?? "-" }])));
  return out;
})();
