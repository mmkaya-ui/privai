import { ModelConfig } from "@/types/llm";

export interface AIModelDefinition {
    id: string;
    name: string;
    providerId: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'groq' | 'ollama' | 'lmstudio' | 'webllm' | 'custom';
    isFree: boolean;
    isLocal?: boolean;
    contextWindow?: number;
    costPer1kInput?: number;
    costPer1kOutput?: number;
    description?: string;
}

// Master list of available models
export const AVAILABLE_MODELS: AIModelDefinition[] = [
    // In-Browser WebGPU Models (Zero installation, zero network packets)
    {
        id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        name: 'Llama 3.2 1B (In-Browser WebGPU)',
        providerId: 'webllm',
        isFree: true,
        isLocal: true,
        contextWindow: 8192,
        description: 'Runs directly in your browser tab via WebGPU • 0 install'
    },
    {
        id: 'gemma-2-2b-it-q4f16_1-MLC',
        name: 'Gemma 2 2B (In-Browser WebGPU)',
        providerId: 'webllm',
        isFree: true,
        isLocal: true,
        contextWindow: 8192,
        description: 'Google Gemma running in-browser via GPU • 0 install'
    },

    // Local Native LLMs (Ollama - Zero Network Telemetry)
    {
        id: 'llama3.3',
        name: 'Llama 3.3 (Local Ollama)',
        providerId: 'ollama',
        isFree: true,
        isLocal: true,
        contextWindow: 128000,
        description: 'Zero telemetry • Running locally on your machine'
    },
    {
        id: 'llama3.2',
        name: 'Llama 3.2 (Local Ollama)',
        providerId: 'ollama',
        isFree: true,
        isLocal: true,
        contextWindow: 128000,
        description: 'Fast, lightweight local edge model'
    },
    {
        id: 'deepseek-r1',
        name: 'DeepSeek R1 (Local Ollama)',
        providerId: 'ollama',
        isFree: true,
        isLocal: true,
        contextWindow: 64000,
        description: 'Local distilled reasoning model'
    },
    {
        id: 'qwen2.5',
        name: 'Qwen 2.5 (Local Ollama)',
        providerId: 'ollama',
        isFree: true,
        isLocal: true,
        contextWindow: 32768,
        description: 'Alibaba open weights running in Ollama'
    },
    {
        id: 'mistral',
        name: 'Mistral 7B (Local Ollama)',
        providerId: 'ollama',
        isFree: true,
        isLocal: true,
        contextWindow: 32768,
        description: 'Efficient local general-purpose model'
    },
    {
        id: 'local-model',
        name: 'LM Studio (Active Model)',
        providerId: 'lmstudio',
        isFree: true,
        isLocal: true,
        contextWindow: 32768,
        description: 'Connects to LM Studio local server on port 1234'
    },

    // ---------------------------------------------------------------------------------
    // Cloud models (BYOK). Prices are USD per 1K tokens, standard tier, non-cached,
    // non-batch. Provenance for every figure is in PRICING_SOURCES below.
    // ---------------------------------------------------------------------------------

    // Groq (LPU inference). Groq's Llama 3.x models moved to enterprise-only ("Contact Sales").
    {
        id: 'openai/gpt-oss-20b',
        name: 'GPT-OSS 20B (Groq)',
        providerId: 'groq',
        isFree: false,
        contextWindow: 131072,
        costPer1kInput: 0.000075,
        costPer1kOutput: 0.0003,
        description: 'Open-weight model on Groq LPUs • very fast, very cheap'
    },
    {
        id: 'openai/gpt-oss-120b',
        name: 'GPT-OSS 120B (Groq)',
        providerId: 'groq',
        isFree: false,
        contextWindow: 131072,
        costPer1kInput: 0.00015,
        costPer1kOutput: 0.0006,
        description: 'Larger open-weight model on Groq LPUs'
    },

    // Anthropic (Haiku price applies to prompts up to 100K tokens)
    {
        id: 'claude-sonnet-5-5',
        name: 'Claude Sonnet 5.5',
        providerId: 'anthropic',
        isFree: false,
        costPer1kInput: 0.002,
        costPer1kOutput: 0.01,
        description: 'Balanced speed and intelligence'
    },
    {
        id: 'claude-haiku-5-5',
        name: 'Claude Haiku 5.5',
        providerId: 'anthropic',
        isFree: false,
        costPer1kInput: 0.0001,
        costPer1kOutput: 0.0005,
        description: 'Fast, low-cost Claude for high-volume tasks'
    },
    {
        id: 'claude-opus-5-5',
        name: 'Claude Opus 5.5',
        providerId: 'anthropic',
        isFree: false,
        costPer1kInput: 0.004,
        costPer1kOutput: 0.02,
        description: 'Long-running agentic coding and knowledge work'
    },

    // OpenAI (short-context standard tier)
    {
        id: 'gpt-6.1-sol',
        name: 'GPT-6.1 Sol',
        providerId: 'openai',
        isFree: false,
        costPer1kInput: 0.002,
        costPer1kOutput: 0.01,
        description: 'OpenAI general-purpose model'
    },
    {
        id: 'gpt-6-luna',
        name: 'GPT-6 Luna',
        providerId: 'openai',
        isFree: false,
        costPer1kInput: 0.0001,
        costPer1kOutput: 0.0005,
        description: 'Small, low-latency OpenAI model'
    },
    {
        id: 'gpt-6-astra',
        name: 'GPT-6 Astra',
        providerId: 'openai',
        isFree: false,
        costPer1kInput: 0.01,
        costPer1kOutput: 0.05,
        description: 'OpenAI flagship'
    },

    // DeepSeek (prices NOT re-verified — docs are client-rendered; see PRICING_SOURCES)
    {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        providerId: 'deepseek',
        isFree: false,
        costPer1kInput: 0.00028,
        costPer1kOutput: 0.00042,
        description: 'DeepSeek non-thinking mode'
    },
    {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner',
        providerId: 'deepseek',
        isFree: false,
        costPer1kInput: 0.00028,
        costPer1kOutput: 0.00042,
        description: 'DeepSeek thinking mode'
    },

    // Google Gemini (prompts up to 200K tokens)
    {
        id: 'gemini-3.8-flash',
        name: 'Gemini 3.8 Flash',
        providerId: 'gemini',
        isFree: false,
        costPer1kInput: 0.00075,
        costPer1kOutput: 0.00375,
        description: 'Promo price through 2026-12-31 ($1.50 / $7.50 per 1M after)'
    },
    {
        id: 'gemini-3.1-flash-lite',
        name: 'Gemini 3.1 Flash-Lite',
        providerId: 'gemini',
        isFree: false,
        costPer1kInput: 0.00025,
        costPer1kOutput: 0.0015,
        description: 'Cost-efficient, high-volume Gemini'
    },
    {
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro (Preview)',
        providerId: 'gemini',
        isFree: false,
        costPer1kInput: 0.002,
        costPer1kOutput: 0.012,
        description: 'Google\'s Pro model'
    }
];

export interface PricingSource {
    url: string;
    /** Date the figures in AVAILABLE_MODELS were checked against `url`. */
    asOf: string;
    /** false = could not be re-checked on that date; treat figures as approximate. */
    verified: boolean;
    note?: string;
}

/** Where each provider's prices come from. Update `asOf` whenever prices are re-checked. */
export const PRICING_SOURCES: Record<'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'groq', PricingSource> = {
    openai: { url: 'https://platform.openai.com/docs/pricing', asOf: '2026-10-15', verified: true },
    anthropic: { url: 'https://docs.anthropic.com/en/docs/about-claude/pricing', asOf: '2026-10-15', verified: true, note: 'Haiku 5.5: $0.10/$0.50 up to 100K-token prompts, $0.50/$2.50 above.' },
    gemini: { url: 'https://ai.google.dev/gemini-api/docs/pricing', asOf: '2026-10-15', verified: true, note: 'Prompts ≤200K tokens. 3.8 Flash promo ends 2026-12-31.' },
    groq: { url: 'https://console.groq.com/docs/models', asOf: '2026-10-15', verified: true, note: 'Free tier with rate limits exists; figures are paid-tier prices.' },
    deepseek: { url: 'https://api-docs.deepseek.com/quick_start/pricing', asOf: '2025-09-29', verified: false, note: 'Pricing page is client-rendered and could not be re-checked; DeepSeek also applies off-peak discounts.' },
};

/** USD cost for a request, from the per-1K-token prices above. Local models are always 0. */
export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const model = getModelById(modelId);
    if (!model || model.isLocal) return 0;
    const inputCost = ((model.costPer1kInput || 0) * inputTokens) / 1000;
    const outputCost = ((model.costPer1kOutput || 0) * outputTokens) / 1000;
    return Math.round((inputCost + outputCost) * 1e7) / 1e7;
}

// Helper to get models available based on API keys & local config
export function getAvailableModels(
    apiKeys: Record<string, string>,
    discoveredOllamaModels?: string[]
): AIModelDefinition[] {
    const list = [...AVAILABLE_MODELS];

    // If dynamically discovered Ollama models are present, prepend or replace
    if (discoveredOllamaModels && discoveredOllamaModels.length > 0) {
        discoveredOllamaModels.forEach(mName => {
            if (!list.some(m => m.id === mName && m.providerId === 'ollama')) {
                list.unshift({
                    id: mName,
                    name: `${mName} (Ollama)`,
                    providerId: 'ollama',
                    isFree: true,
                    isLocal: true,
                    description: 'Local model detected in your Ollama library'
                });
            }
        });
    }

    return list.filter(model => {
        // Local models are always visible
        if (model.isLocal) return true;
        // Free cloud models (Groq requires key or free)
        if (model.isFree) return true;
        // Paid models require key
        return !!apiKeys[model.providerId];
    });
}

// Helper to get model by ID
export function getModelById(modelId: string): AIModelDefinition | undefined {
    return AVAILABLE_MODELS.find(m => m.id === modelId);
}

// Helper to create ModelConfig from AIModelDefinition
export function createModelConfig(
    model: AIModelDefinition,
    temperature = 0.7,
    baseUrl?: string
): ModelConfig {
    return {
        provider: model.providerId,
        modelId: model.id,
        temperature,
        baseUrl
    };
}
