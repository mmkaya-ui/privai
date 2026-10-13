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

    // Free Fast Cloud Models (Groq)
    {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B (Groq)',
        providerId: 'groq',
        isFree: true,
        contextWindow: 128000,
        description: 'Meta\'s open model hosted on Groq LPUs'
    },
    {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B (Groq)',
        providerId: 'groq',
        isFree: true,
        contextWindow: 128000,
        description: 'Ultra-fast low-latency cloud model'
    },
    {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B (Groq)',
        providerId: 'groq',
        isFree: true,
        contextWindow: 32768,
        description: 'Mistral MoE running at high tokens/sec'
    },

    // Paid Models - Anthropic
    {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        providerId: 'anthropic',
        isFree: false,
        contextWindow: 200000,
        costPer1kInput: 0.003,
        costPer1kOutput: 0.015,
        description: 'Anthropic\'s industry-leading coding flagship'
    },
    {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        providerId: 'anthropic',
        isFree: false,
        contextWindow: 200000,
        costPer1kInput: 0.0008,
        costPer1kOutput: 0.004,
        description: 'Lightning-fast compact Claude model'
    },
    {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        providerId: 'anthropic',
        isFree: false,
        contextWindow: 200000,
        costPer1kInput: 0.015,
        costPer1kOutput: 0.075,
        description: 'Deep analytical synthesis and reasoning'
    },

    // Paid Models - OpenAI
    {
        id: 'gpt-4o',
        name: 'GPT-4o',
        providerId: 'openai',
        isFree: false,
        contextWindow: 128000,
        costPer1kInput: 0.0025,
        costPer1kOutput: 0.01,
        description: 'OpenAI\'s flagship multimodal intelligence'
    },
    {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        providerId: 'openai',
        isFree: false,
        contextWindow: 128000,
        costPer1kInput: 0.00015,
        costPer1kOutput: 0.0006,
        description: 'Affordable, low-latency reasoning'
    },
    {
        id: 'o3-mini',
        name: 'o3-mini',
        providerId: 'openai',
        isFree: false,
        contextWindow: 128000,
        costPer1kInput: 0.0011,
        costPer1kOutput: 0.0044,
        description: 'Next-generation STEM reasoning model'
    },

    // Paid Models - DeepSeek
    {
        id: 'deepseek-chat',
        name: 'DeepSeek V3',
        providerId: 'deepseek',
        isFree: false,
        contextWindow: 64000,
        costPer1kInput: 0.00014,
        costPer1kOutput: 0.00028,
        description: 'DeepSeek\'s flagship 671B MoE chat model'
    },
    {
        id: 'deepseek-reasoner',
        name: 'DeepSeek R1',
        providerId: 'deepseek',
        isFree: false,
        contextWindow: 64000,
        costPer1kInput: 0.00055,
        costPer1kOutput: 0.00219,
        description: 'Open reasoning model with chain-of-thought'
    },

    // Gemini
    {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        providerId: 'gemini',
        isFree: false,
        contextWindow: 2000000,
        costPer1kInput: 0.00125,
        costPer1kOutput: 0.005,
        description: 'Google\'s 2M context multi-modal flagship'
    },
    {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        providerId: 'gemini',
        isFree: false,
        contextWindow: 1000000,
        costPer1kInput: 0.000075,
        costPer1kOutput: 0.0003,
        description: 'High-speed lightweight Gemini engine'
    }
];

export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const model = getModelById(modelId);
    if (!model || model.isLocal || model.isFree) return 0;
    const inputCost = ((model.costPer1kInput || 0) * inputTokens) / 1000;
    const outputCost = ((model.costPer1kOutput || 0) * outputTokens) / 1000;
    return Math.round((inputCost + outputCost) * 100000) / 100000;
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
