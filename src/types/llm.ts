export type Role = 'user' | 'assistant' | 'system';

export interface MessageTelemetry {
  tokens?: number;      // output tokens
  inputTokens?: number;
  tokPerSec?: number;   // output tokens / decode time (after first token)
  ttftMs?: number;      // time to first token
  durationMs?: number;
  cost?: number;        // USD, from the model price table
  /** 'provider' = counts reported by the API; 'estimated' = chars/4 heuristic. */
  usageSource?: 'provider' | 'estimated';
  provider?: string;
  isLocal?: boolean;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  model?: string; // Model used for this response
  attachments?: Attachment[];
  telemetry?: MessageTelemetry;
  variants?: string[]; // Branch versions for edited prompts
  variantIndex?: number; // Active version (0-indexed)
  sources?: { filename: string; relevance: number }[]; // Local RAG source citations
}

export interface Attachment {
  id: string;
  type: 'image' | 'file';
  name: string;
  data: string; // base64 or url
  mimeType: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  modelConfig: ModelConfig;
}

export type LLMProviderType =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'groq'
  | 'ollama'
  | 'lmstudio'
  | 'webllm'
  | 'custom';

export interface ModelConfig {
  provider: LLMProviderType;
  modelId: string;
  temperature?: number;
  apiKey?: string; // Optional override per chat
  baseUrl?: string; // For custom providers or local proxies
}

/** Normalized failure categories every provider maps its errors onto. */
export type LLMErrorCode =
  | 'auth'         // 401/403, missing/invalid key
  | 'rate_limit'   // 429, quota exhausted
  | 'network'      // fetch failed: offline, DNS, CORS, local server not running
  | 'aborted'      // caller aborted via AbortSignal
  | 'bad_request'  // 400/413/422, invalid model/params, content blocked
  | 'not_found'    // 404, unknown model or endpoint
  | 'server'       // 5xx, 529 overloaded
  | 'unsupported'  // environment can't run this provider (e.g. no WebGPU)
  | 'unknown';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** What a provider stream yields. Usage may arrive mid-stream or at the end, possibly in parts. */
export type LLMStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'usage'; usage: Partial<TokenUsage> };

/**
 * The single contract every inference backend (cloud, localhost, in-browser) implements.
 *
 * Conformance rules (enforced by src/services/providers.conformance.test.ts):
 *  - `stream` yields `token` events in order and `usage` events when the backend reports counts.
 *  - Aborting `signal` stops the stream and rejects with an LLMError whose code is 'aborted'
 *    (its `name` is 'AbortError' so generic abort checks keep working).
 *  - Every failure (HTTP status, network, mid-stream error event) surfaces as an `LLMError`.
 *  - Breaking out of the iterator early releases the underlying connection.
 */
export interface LLMProvider {
  readonly id: LLMProviderType;
  readonly name: string;
  /** True when inference never leaves the user's machine (localhost or in-tab). */
  readonly isLocal: boolean;
  readonly requiresApiKey: boolean;
  stream(
    messages: Message[],
    config: ModelConfig,
    apiKey: string,
    signal?: AbortSignal
  ): AsyncGenerator<LLMStreamEvent, void, unknown>;
}

export interface ArtifactData {
  id: string;
  title: string;
  language: string;
  content: string;
  type: 'code' | 'html' | 'markdown' | 'svg';
}
