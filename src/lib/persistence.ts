import type { ChatSession } from "@/types/llm";

/**
 * Sessions whose object differs from the version last written to IndexedDB.
 *
 * The reducer replaces a session object whenever anything in it changes, so a reference
 * check finds every chat that needs saving — including one that is still receiving a
 * streamed reply after the user switched to another chat.
 */
export function sessionsNeedingSave(sessions: ChatSession[], lastSaved: ReadonlyMap<string, ChatSession>): ChatSession[] {
    return sessions.filter(s => lastSaved.get(s.id) !== s);
}
