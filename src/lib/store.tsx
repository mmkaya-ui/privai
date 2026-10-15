"use client";

import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { ChatSession, Message, ModelConfig, ArtifactData, MessageTelemetry } from '@/types/llm';
import { sessionsNeedingSave } from './persistence';

// State Definition
export interface AppState {
    sessions: ChatSession[];
    currentSessionId: string | null;
    apiKeys: Record<string, string>; // provider -> key
    customBaseUrls: Record<string, string>; // provider -> baseUrl
    theme: 'dark' | 'light' | 'oled' | 'system';
    textSize: 'small' | 'medium' | 'large' | 'xlarge';
    isSidebarOpen: boolean;
    isSettingsOpen: boolean;
    isCommandPaletteOpen: boolean;
    activeArtifact: ArtifactData | null;
    isArtifactOpen: boolean;
    activeView: 'chat' | 'arena';
    defaultModelConfig: ModelConfig;
    /** Model names reported by the user's Ollama server on the last successful "Test Connection". */
    discoveredOllamaModels: string[];
}

// Initial State
const initialState: AppState = {
    sessions: [],
    currentSessionId: null,
    apiKeys: {},
    customBaseUrls: {
        ollama: 'http://localhost:11434',
        lmstudio: 'http://localhost:1234/v1'
    },
    theme: 'dark',
    textSize: 'medium',
    isSidebarOpen: true,
    isSettingsOpen: false,
    isCommandPaletteOpen: false,
    activeArtifact: null,
    isArtifactOpen: false,
    activeView: 'chat',
    defaultModelConfig: {
        provider: 'groq',
        modelId: 'openai/gpt-oss-20b',
        temperature: 0.7,
    },
    discoveredOllamaModels: [],
};

// Actions
export type Action =
    | { type: 'SET_API_KEY'; provider: string; key: string }
    | { type: 'SET_CUSTOM_BASE_URL'; provider: string; url: string }
    | { type: 'CREATE_SESSION'; session: ChatSession }
    | { type: 'DELETE_SESSION'; sessionId: string }
    | { type: 'SELECT_SESSION'; sessionId: string }
    | { type: 'CLEAR_SESSION_MESSAGES'; sessionId: string }
    | { type: 'ADD_MESSAGE'; sessionId: string; message: Message }
    | { type: 'UPDATE_MESSAGE'; sessionId: string; messageId: string; content: string; telemetry?: MessageTelemetry; sources?: { filename: string; relevance: number }[]; status?: Message['status'] }
    | { type: 'SWITCH_MESSAGE_VARIANT'; sessionId: string; messageId: string; variantIndex: number }
    | { type: 'TOGGLE_SIDEBAR'; open?: boolean }
    | { type: 'TOGGLE_SETTINGS'; open?: boolean }
    | { type: 'TOGGLE_COMMAND_PALETTE'; open?: boolean }
    | { type: 'OPEN_ARTIFACT'; artifact: ArtifactData }
    | { type: 'CLOSE_ARTIFACT' }
    | { type: 'SET_VIEW'; view: AppState['activeView'] }
    | { type: 'SET_THEME'; theme: AppState['theme'] }
    | { type: 'SET_TEXT_SIZE'; size: AppState['textSize'] }
    | { type: 'SET_MODEL'; config: ModelConfig }
    | { type: 'SET_DISCOVERED_OLLAMA_MODELS'; models: string[] }
    | { type: 'LOAD_STATE'; state: Partial<AppState> };

// Reducer
function appReducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'SET_VIEW':
            return { ...state, activeView: action.view };
        case 'SET_API_KEY':
            return { ...state, apiKeys: { ...state.apiKeys, [action.provider]: action.key } };
        case 'SET_CUSTOM_BASE_URL':
            return {
                ...state,
                customBaseUrls: { ...state.customBaseUrls, [action.provider]: action.url }
            };
        case 'CREATE_SESSION':
            return {
                ...state,
                sessions: [action.session, ...state.sessions],
                currentSessionId: action.session.id
            };
        case 'SELECT_SESSION':
            return { ...state, currentSessionId: action.sessionId };
        case 'CLEAR_SESSION_MESSAGES':
            return {
                ...state,
                sessions: state.sessions.map(s =>
                    s.id === action.sessionId
                        ? { ...s, messages: [], updatedAt: Date.now() }
                        : s
                )
            };
        case 'DELETE_SESSION':
            return {
                ...state,
                sessions: state.sessions.filter(s => s.id !== action.sessionId),
                currentSessionId: state.currentSessionId === action.sessionId ? null : state.currentSessionId
            };
        case 'ADD_MESSAGE':
            return {
                ...state,
                sessions: state.sessions.map(s =>
                    s.id === action.sessionId
                        ? { ...s, messages: [...s.messages, action.message], updatedAt: Date.now() }
                        : s
                )
            };
        case 'UPDATE_MESSAGE':
            return {
                ...state,
                sessions: state.sessions.map(s =>
                    s.id === action.sessionId
                        ? {
                            ...s,
                            messages: s.messages.map(m =>
                                m.id === action.messageId
                                    ? {
                                        ...m,
                                        content: action.content,
                                        ...(action.telemetry ? { telemetry: action.telemetry } : {}),
                                        ...(action.sources ? { sources: action.sources } : {}),
                                        ...(action.status ? { status: action.status } : {})
                                    }
                                    : m
                            )
                        }
                        : s
                )
            };
        case 'SWITCH_MESSAGE_VARIANT':
            return {
                ...state,
                sessions: state.sessions.map(s =>
                    s.id === action.sessionId
                        ? {
                            ...s,
                            messages: s.messages.map(m =>
                                m.id === action.messageId && m.variants && m.variants[action.variantIndex] !== undefined
                                    ? {
                                        ...m,
                                        content: m.variants[action.variantIndex],
                                        variantIndex: action.variantIndex
                                    }
                                    : m
                            )
                        }
                        : s
                )
            };
        case 'TOGGLE_SIDEBAR':
            return { ...state, isSidebarOpen: action.open ?? !state.isSidebarOpen };
        case 'TOGGLE_SETTINGS':
            return { ...state, isSettingsOpen: action.open ?? !state.isSettingsOpen };
        case 'TOGGLE_COMMAND_PALETTE':
            return { ...state, isCommandPaletteOpen: action.open ?? !state.isCommandPaletteOpen };
        case 'OPEN_ARTIFACT':
            return { ...state, activeArtifact: action.artifact, isArtifactOpen: true };
        case 'CLOSE_ARTIFACT':
            return { ...state, isArtifactOpen: false };
        case 'SET_THEME':
            return { ...state, theme: action.theme };
        case 'SET_TEXT_SIZE':
            return { ...state, textSize: action.size };
        case 'SET_MODEL':
            return { ...state, defaultModelConfig: action.config };
        case 'SET_DISCOVERED_OLLAMA_MODELS':
            return { ...state, discoveredOllamaModels: action.models };
        case 'LOAD_STATE':
            return { ...state, ...action.state };
        default:
            return state;
    }
}

// Context
const AppContext = createContext<{
    state: AppState;
    dispatch: React.Dispatch<Action>;
}>({ state: initialState, dispatch: () => null });

// Provider
export const AppProvider = ({ children }: { children: React.ReactNode }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const [isHydrated, setIsHydrated] = React.useState(false);
    /** Session objects as last written to IndexedDB (see sessionsNeedingSave). */
    const lastSavedRef = useRef<Map<string, ChatSession>>(new Map());
    const sessionsRef = useRef<ChatSession[]>(state.sessions);

    // Load state from IndexedDB on mount
    useEffect(() => {
        const loadState = async () => {
            try {
                const { storage } = await import('@/services/storage');
                const [sessions, storedSettings] = await Promise.all([
                    storage.getSessions(),
                    storage.getAllSettings()
                ]);

                const loadedState: Partial<AppState> = {
                    sessions: sessions || [],
                    apiKeys: (storedSettings.apiKeys as Record<string, string>) || {},
                    customBaseUrls: (storedSettings.customBaseUrls as Record<string, string>) || initialState.customBaseUrls,
                    theme: (storedSettings.theme as AppState['theme']) || 'dark',
                    textSize: (storedSettings.textSize as AppState['textSize']) || 'medium',
                    defaultModelConfig: (storedSettings.defaultModelConfig as AppState['defaultModelConfig']) || initialState.defaultModelConfig,
                    discoveredOllamaModels: (storedSettings.discoveredOllamaModels as string[]) || []
                };

                for (const s of loadedState.sessions ?? []) lastSavedRef.current.set(s.id, s);
                dispatch({ type: 'LOAD_STATE', state: loadedState });
            } catch (e) {
                console.error("Failed to load state from IDB", e);
            } finally {
                setIsHydrated(true);
            }
        };
        loadState();
    }, []);

    // Global Command Palette Shortcut (Cmd+K / Ctrl+K)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE' });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Apply Theme & Text Size to Body
    useEffect(() => {
        if (!isHydrated) return;

        const root = document.documentElement;

        // Text Size
        root.setAttribute('data-text-size', state.textSize);

        const applyTheme = () => {
            if (state.theme === 'system') {
                const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                root.setAttribute('data-theme', systemTheme);
            } else {
                root.setAttribute('data-theme', state.theme);
            }
        };

        applyTheme();

        // Listener for system changes
        if (state.theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => applyTheme();

            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', handleChange);
                return () => mediaQuery.removeEventListener('change', handleChange);
            } else {
                mediaQuery.addListener(handleChange);
                return () => mediaQuery.removeListener(handleChange);
            }
        }

    }, [state.theme, state.textSize, isHydrated]);

    // Save Settings Changes
    useEffect(() => {
        if (!isHydrated) return;
        const saveSettings = async () => {
            const { storage } = await import('@/services/storage');
            await storage.saveSetting('apiKeys', state.apiKeys);
            await storage.saveSetting('customBaseUrls', state.customBaseUrls);
            await storage.saveSetting('theme', state.theme);
            await storage.saveSetting('textSize', state.textSize);
            await storage.saveSetting('defaultModelConfig', state.defaultModelConfig);
            await storage.saveSetting('discoveredOllamaModels', state.discoveredOllamaModels);
        };
        saveSettings();
    }, [state.apiKeys, state.customBaseUrls, state.theme, state.textSize, state.defaultModelConfig, state.discoveredOllamaModels, isHydrated]);

    // Save session changes: debounced, for EVERY changed chat (not only the one on screen),
    // and flushed immediately when the tab is hidden.
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flushSessions = React.useCallback(async () => {
        const dirty = sessionsNeedingSave(sessionsRef.current, lastSavedRef.current);
        if (dirty.length === 0) return;
        const { storage } = await import('@/services/storage');
        for (const session of dirty) {
            await storage.saveSession(session);
            lastSavedRef.current.set(session.id, session);
        }
    }, []);

    useEffect(() => {
        sessionsRef.current = state.sessions;
        if (!isHydrated) return;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            saveTimeoutRef.current = null;
            void flushSessions();
        }, 1000);
    }, [state.sessions, isHydrated, flushSessions]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'hidden') return;
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
            void flushSessions();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [flushSessions]);

    if (!isHydrated) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-bg-base text-text-muted">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm font-medium animate-pulse">Initializing PrivAI...</p>
                </div>
            </div>
        );
    }

    return (
        <AppContext.Provider value={{ state, dispatch }}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => useContext(AppContext);
