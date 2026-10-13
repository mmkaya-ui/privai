import { LLMProviderAdapter, Message, ModelConfig } from "@/types/llm";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_LMSTUDIO_URL = "http://localhost:1234/v1";

/**
 * Checks if local Ollama instance is reachable and returns installed models
 */
export async function checkOllamaConnection(baseUrl = DEFAULT_OLLAMA_URL): Promise<{ ok: boolean; models: string[]; error?: string }> {
    try {
        const cleanBase = baseUrl.replace(/\/+$/, '');
        const res = await fetch(`${cleanBase}/api/tags`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(3000)
        });
        if (!res.ok) {
            return { ok: false, models: [], error: `Ollama returned HTTP ${res.status}` };
        }
        const data = await res.json() as { models?: Array<{ name: string }> };
        const models = (data.models || []).map(m => m.name).filter(Boolean);
        return { ok: true, models };
    } catch (err: unknown) {
        const error = err as Error;
        return {
            ok: false,
            models: [],
            error: error.name === 'TimeoutError'
                ? 'Connection timed out (is Ollama running?)'
                : 'Could not connect to Ollama on localhost:11434'
        };
    }
}

/**
 * Checks LM Studio connection (OpenAI-compatible /v1/models endpoint)
 */
export async function checkLMStudioConnection(baseUrl = DEFAULT_LMSTUDIO_URL): Promise<{ ok: boolean; models: string[]; error?: string }> {
    try {
        let cleanBase = baseUrl.replace(/\/+$/, '');
        if (!cleanBase.endsWith('/v1')) cleanBase = `${cleanBase}/v1`;
        const res = await fetch(`${cleanBase}/models`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(3000)
        });
        if (!res.ok) {
            return { ok: false, models: [], error: `LM Studio returned HTTP ${res.status}` };
        }
        const data = await res.json() as { data?: Array<{ id: string }> };
        const models = (data.data || []).map(m => m.id).filter(Boolean);
        return { ok: true, models };
    } catch {
        return {
            ok: false,
            models: [],
            error: 'Could not connect to LM Studio on localhost:1234'
        };
    }
}

export const OllamaAdapter: LLMProviderAdapter = {
    id: 'ollama',
    name: 'Ollama (Local)',

    async chat(messages: Message[], config: ModelConfig, apiKey?: string, signal?: AbortSignal) {
        const baseUrl = (config.baseUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
        const endpoint = `${baseUrl}/api/chat`;

        const ollamaMessages = messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        let response: Response;
        try {
            response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                signal,
                body: JSON.stringify({
                    model: config.modelId,
                    messages: ollamaMessages,
                    options: {
                        temperature: config.temperature ?? 0.7
                    },
                    stream: true
                })
            });
        } catch (err: unknown) {
            const error = err as Error;
            if (error.name === 'AbortError') throw err;
            throw new Error(`Failed to connect to local Ollama (${baseUrl}). Is Ollama running? Run 'ollama serve' or start Ollama.`);
        }

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Ollama API Error (${response.status})`);
        }

        if (!response.body) throw new Error("No response body from Ollama");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        return (async function* () {
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        const json = JSON.parse(trimmed);
                        if (json.message?.content) {
                            yield json.message.content;
                        }
                    } catch {
                        // ignore parse errors for partial chunks
                    }
                }
            }
        })();
    }
};

export const LMStudioAdapter: LLMProviderAdapter = {
    id: 'lmstudio',
    name: 'LM Studio (Local)',

    async chat(messages: Message[], config: ModelConfig, _apiKey?: string, signal?: AbortSignal) {
        let baseUrl = (config.baseUrl || DEFAULT_LMSTUDIO_URL).replace(/\/+$/, '');
        if (!baseUrl.endsWith('/v1')) baseUrl = `${baseUrl}/v1`;
        const endpoint = `${baseUrl}/chat/completions`;

        let response: Response;
        try {
            response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                signal,
                body: JSON.stringify({
                    model: config.modelId || "local-model",
                    messages: messages.map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    temperature: config.temperature ?? 0.7,
                    stream: true
                })
            });
        } catch (err: unknown) {
            const error = err as Error;
            if (error.name === 'AbortError') throw err;
            throw new Error(`Failed to connect to LM Studio (${baseUrl}). Start LM Studio Local Server.`);
        }

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `LM Studio Error (${response.status})`);
        }

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        return (async function* () {
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6).trim();
                        if (data === "[DONE]") return;
                        try {
                            const json = JSON.parse(data);
                            const token = json.choices?.[0]?.delta?.content || "";
                            if (token) yield token;
                        } catch {
                            // ignore partial
                        }
                    }
                }
            }
        })();
    }
};
