import { LLMProviderAdapter, Message, ModelConfig } from "@/types/llm";

export const AnthropicAdapter: LLMProviderAdapter = {
    id: 'anthropic',
    name: 'Anthropic',

    async chat(messages: Message[], config: ModelConfig, apiKey: string, signal?: AbortSignal) {
        if (!apiKey) throw new Error("API Key required for Anthropic");

        // Anthropic uses a different message format
        const anthropicMessages = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            }));

        const systemMessage = messages.find(m => m.role === 'system')?.content;
        const endpoint = config.baseUrl?.trim() || "https://api.anthropic.com/v1/messages";

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                // Required by Anthropic for direct browser-side API calls
                "anthropic-dangerous-direct-browser-access": "true"
            },
            signal,
            body: JSON.stringify({
                model: config.modelId,
                max_tokens: 4096,
                messages: anthropicMessages,
                ...(systemMessage && { system: systemMessage }),
                stream: true
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Anthropic API Error (${response.status})`);
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
                        const data = line.slice(6);
                        try {
                            const json = JSON.parse(data);
                            if (json.type === 'content_block_delta') {
                                const token = json.delta?.text || "";
                                yield token;
                            }
                        } catch {
                            // ignore parse error for partial lines
                        }
                    }
                }
            }
        })();
    }
};
