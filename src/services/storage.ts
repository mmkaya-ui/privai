import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ChatSession } from '@/types/llm';

interface PrivAIDB extends DBSchema {
    sessions: {
        key: string;
        value: ChatSession;
        indexes: { 'by-date': number };
    };
    settings: {
        key: string;
        value: unknown;
    };
}

const DB_NAME = 'privai-db';
const DB_VERSION = 1;

class StorageService {
    private dbPromise: Promise<IDBPDatabase<PrivAIDB>>;

    constructor() {
        if (typeof window === 'undefined') {
            this.dbPromise = new Promise(() => { }); // No-op on server
            return;
        }

        this.dbPromise = openDB<PrivAIDB>(DB_NAME, DB_VERSION, {
            upgrade(db) {
                // Sessions Store
                const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
                sessionStore.createIndex('by-date', 'updatedAt');

                // Settings Store
                db.createObjectStore('settings');
            },
        });
    }

    async saveSession(session: ChatSession): Promise<void> {
        const db = await this.dbPromise;
        await db.put('sessions', session);
    }

    async getSessions(): Promise<ChatSession[]> {
        const db = await this.dbPromise;
        const sessions = await db.getAllFromIndex('sessions', 'by-date');
        return sessions.reverse(); // Newest first
    }

    async getSession(id: string): Promise<ChatSession | undefined> {
        const db = await this.dbPromise;
        return db.get('sessions', id);
    }

    async deleteSession(id: string): Promise<void> {
        const db = await this.dbPromise;
        await db.delete('sessions', id);
    }

    async saveSetting(key: string, value: unknown): Promise<void> {
        const db = await this.dbPromise;
        await db.put('settings', value, key);
    }

    async getSetting<T = unknown>(key: string): Promise<T | undefined> {
        const db = await this.dbPromise;
        return (await db.get('settings', key)) as T | undefined;
    }

    async getAllSettings(): Promise<Record<string, unknown>> {
        const db = await this.dbPromise;
        const keys = await db.getAllKeys('settings');
        const values = await db.getAll('settings');
        const result: Record<string, unknown> = {};
        keys.forEach((k, i) => {
            if (typeof k === 'string') result[k] = values[i];
        });
        return result;
    }
}

export const storage = new StorageService();
