import type { Message } from "@/types/llm";

/** How many conversation turns (after cleaning) are sent with each request. */
export const DEFAULT_HISTORY_TURNS = 10;

/**
 * True for messages that are UI notices rather than real conversation turns:
 * provider errors, "stopped before any output" notices and the offline notice.
 * Also recognises the shapes older builds stored before `status` existed.
 */
export function isNonConversationalTurn(m: Message): boolean {
    if (m.status === "error" || m.status === "notice") return true;
    if (m.role === "assistant" && m.content.startsWith("**Error**:")) return true; // legacy error turns
    if (m.role === "assistant" && m.model === "system") return true;              // legacy offline notice
    return false;
}

/**
 * Build the message list that is actually sent to a provider.
 *
 *  - drops error / notice turns and empty turns (e.g. a reply stopped before its first token),
 *  - keeps the last `maxTurns` turns,
 *  - drops leading assistant turns so the request starts with the user (Anthropic and Gemini require that),
 *  - merges consecutive turns from the same role (dropping a failed reply can leave two user turns in a row).
 *
 * System messages are kept and passed through untouched.
 */
export function buildPromptHistory(messages: Message[], maxTurns = DEFAULT_HISTORY_TURNS): Message[] {
    const kept = messages.filter(m => !isNonConversationalTurn(m) && m.content.trim() !== "");
    const system = kept.filter(m => m.role === "system");
    let turns = kept.filter(m => m.role !== "system").slice(-maxTurns);

    while (turns.length && turns[0].role === "assistant") turns = turns.slice(1);

    const merged: Message[] = [];
    for (const m of turns) {
        const prev = merged[merged.length - 1];
        if (prev && prev.role === m.role) {
            merged[merged.length - 1] = { ...prev, content: `${prev.content}\n\n${m.content}` };
        } else {
            merged.push(m);
        }
    }
    return [...system, ...merged];
}
