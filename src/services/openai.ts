import { LLMProviderAdapter, Message, ModelConfig } from "@/types/llm";

export const OpenAIAdapter: LLMProviderAdapter = {
    id: 'openai',
    name: 'OpenAI',

    async chat(messages: Message[], config: ModelConfig, apiKey: string, signal?: AbortSignal) {
        if (!apiKey) throw new Error("API Key required for OpenAI");

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            signal,
            body: JSON.stringify({
                model: config.modelId,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })),
                ...((!config.modelId.startsWith('o1') && !config.modelId.startsWith('o3')) && {
                    temperature: config.temperature
                }),
                stream: true
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "OpenAI API Error");
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
                        if (data === "[DONE]") return;
                        try {
                            const json = JSON.parse(data);
                            const token = json.choices[0]?.delta?.content || "";
                            yield token;
                        } catch (e) {
                            // ignore parse error for partial lines
                        }
                    }
                }
            }
        })();
    }
};
