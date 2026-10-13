export type Role = 'user' | 'assistant' | 'system';

export interface MessageTelemetry {
  tokens?: number;
  tokPerSec?: number;
  durationMs?: number;
  cost?: number;
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

export interface LLMProvider {
  id: string;
  name: string;
  models: AIModel[];
}

export interface AIModel {
  id: string;
  name: string;
  providerId: string;
  contextWindow?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  isLocal?: boolean;
}

export interface LLMProviderAdapter {
  id: string;
  name: string;
  chat(
    messages: Message[],
    config: ModelConfig,
    apiKey: string,
    signal?: AbortSignal
  ): Promise<AsyncGenerator<string, void, unknown>>;
}

export interface ArtifactData {
  id: string;
  title: string;
  language: string;
  content: string;
  type: 'code' | 'html' | 'markdown' | 'svg';
}
