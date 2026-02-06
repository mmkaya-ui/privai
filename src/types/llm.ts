export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  model?: string; // Model used for this response
  attachments?: Attachment[];
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

export interface ModelConfig {
  provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'custom';
  modelId: string;
  temperature?: number;
  apiKey?: string; // Optional override per chat
  baseUrl?: string; // For custom providers
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
}

export interface LLMProviderAdapter {
  id: string;
  name: string;
  chat(messages: Message[], config: ModelConfig, apiKey: string, signal?: AbortSignal): Promise<AsyncGenerator<string, void, unknown>>;
}
