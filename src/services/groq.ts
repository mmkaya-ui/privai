import { LLMProviderAdapter, Message, ModelConfig } from "@/types/llm";

export const GroqAdapter: LLMProviderAdapter = {
    id: 'groq',
    name: 'Groq',

    async chat(messages: Message[], config: ModelConfig, apiKey: string, signal?: AbortSignal) {
        if (!apiKey) throw new Error("API Key required for Groq. Get a free key at console.groq.com");

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
                temperature: config.temperature,
                stream: true
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Groq API Error");
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
