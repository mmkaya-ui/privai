import { LLMProviderAdapter, Message, ModelConfig } from "@/types/llm";

export const GeminiAdapter: LLMProviderAdapter = {
    id: 'gemini',
    name: 'Google Gemini',

    async chat(messages: Message[], config: ModelConfig, apiKey: string, signal?: AbortSignal) {
        if (!apiKey) throw new Error("API Key required for Gemini");

        // Convert messages to Gemini format
        const geminiContents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.modelId}:streamGenerateContent?key=${apiKey}&alt=sse`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                signal,
                body: JSON.stringify({
                    contents: geminiContents,
                    generationConfig: {
                        temperature: config.temperature
                    }
                })
            }
        );

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Gemini API Error");
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
                            const token = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
