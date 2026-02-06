import { ModelConfig } from "@/types/llm";

export interface AIModelDefinition {
    id: string;
    name: string;
    providerId: string;
    isFree: boolean;
    contextWindow?: number;
    description?: string;
}

// Master list of available models
export const AVAILABLE_MODELS: AIModelDefinition[] = [
    // Free Models (Groq - requires free API key from console.groq.com)
    {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B',
        providerId: 'groq',
        isFree: true,
        contextWindow: 128000,
        description: 'Meta\'s latest, most capable open model'
    },
    {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B',
        providerId: 'groq',
        isFree: true,
        contextWindow: 128000,
        description: 'Fast, lightweight model for quick tasks'
    },
    {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B',
        providerId: 'groq',
        isFree: true,
        contextWindow: 32768,
        description: 'Mistral\'s powerful MoE model'
    },
    {
        id: 'gemma2-9b-it',
        name: 'Gemma 2 9B',
        providerId: 'groq',
        isFree: true,
        contextWindow: 8192,
        description: 'Google\'s efficient open model'
    },

    // Paid Models - OpenAI
    {
        id: 'gpt-4o',
        name: 'GPT-4o',
        providerId: 'openai',
        isFree: false,
        contextWindow: 128000,
        description: 'OpenAI\'s flagship multimodal model'
    },
    {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        providerId: 'openai',
        isFree: false,
        contextWindow: 128000,
        description: 'Fast and affordable'
    },
    {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        providerId: 'openai',
        isFree: false,
        contextWindow: 128000,
        description: 'High intelligence model'
    },
    {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        providerId: 'openai',
        isFree: false,
        contextWindow: 16385,
        description: 'Fast and cost-effective'
    },

    // Paid Models - Anthropic
    {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        providerId: 'anthropic',
        isFree: false,
        contextWindow: 200000,
        description: 'Anthropic\'s balanced flagship'
    },
    {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        providerId: 'anthropic',
        isFree: false,
        contextWindow: 200000,
        description: 'Most capable Claude model'
    },
    {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        providerId: 'anthropic',
        isFree: false,
        contextWindow: 200000,
        description: 'Fast and compact'
    },

    // Paid Models - DeepSeek
    {
        id: 'deepseek-chat',
        name: 'DeepSeek V3',
        providerId: 'deepseek',
        isFree: false,
        contextWindow: 64000,
        description: 'DeepSeek\'s flagship chat model'
    },
    {
        id: 'deepseek-reasoner',
        name: 'DeepSeek R1',
        providerId: 'deepseek',
        isFree: false,
        contextWindow: 64000,
        description: 'Advanced reasoning model'
    },

    // Paid Models - Gemini
    {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        providerId: 'gemini',
        isFree: false,
        contextWindow: 1000000,
        description: 'Google\'s latest fast model'
    },
    {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        providerId: 'gemini',
        isFree: false,
        contextWindow: 2000000,
        description: 'Large context window model'
    },
];

// Helper to get models available based on API keys
export function getAvailableModels(apiKeys: Record<string, string>): AIModelDefinition[] {
    return AVAILABLE_MODELS.filter(model => {
        if (model.isFree) {
            // Free models require groq key
            return !!apiKeys['groq'];
        }
        return !!apiKeys[model.providerId];
    });
}

// Helper to get model by ID
export function getModelById(modelId: string): AIModelDefinition | undefined {
    return AVAILABLE_MODELS.find(m => m.id === modelId);
}

// Helper to create ModelConfig from AIModelDefinition
export function createModelConfig(model: AIModelDefinition, temperature = 0.7): ModelConfig {
    return {
        provider: model.providerId as ModelConfig['provider'],
        modelId: model.id,
        temperature
    };
}
