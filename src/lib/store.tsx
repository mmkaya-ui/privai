"use client";

import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { ChatSession, Message, ModelConfig } from '@/types/llm';
import { v4 as uuidv4 } from 'uuid';

// State Definition
interface AppState {
    sessions: ChatSession[];
    currentSessionId: string | null;
    apiKeys: Record<string, string>; // provider -> key
    theme: 'dark' | 'light' | 'oled' | 'system';
    textSize: 'small' | 'medium' | 'large' | 'xlarge';
    isSidebarOpen: boolean;
    isSettingsOpen: boolean;
    defaultModelConfig: ModelConfig;
}

// Initial State
const initialState: AppState = {
    sessions: [],
    currentSessionId: null,
    apiKeys: {},
    theme: 'dark', // Default, will verify 'system' later
    textSize: 'medium',
    isSidebarOpen: true,
    isSettingsOpen: false,
    defaultModelConfig: {
        provider: 'openai',
        modelId: 'gpt-4o',
        temperature: 0.7,
    },
};

// Actions
type Action =
    | { type: 'SET_API_KEY'; provider: string; key: string }
    | { type: 'CREATE_SESSION'; session: ChatSession }
    | { type: 'DELETE_SESSION'; sessionId: string }
    | { type: 'SELECT_SESSION'; sessionId: string }
    | { type: 'ADD_MESSAGE'; sessionId: string; message: Message }
    | { type: 'UPDATE_MESSAGE'; sessionId: string; messageId: string; content: string }
    | { type: 'TOGGLE_SIDEBAR' }
    | { type: 'TOGGLE_SETTINGS' }
    | { type: 'SET_THEME'; theme: AppState['theme'] }
    | { type: 'SET_TEXT_SIZE'; size: AppState['textSize'] }
    | { type: 'SET_MODEL'; config: ModelConfig }
    | { type: 'LOAD_STATE'; state: Partial<AppState> };

// Reducer
function appReducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'SET_API_KEY':
            return { ...state, apiKeys: { ...state.apiKeys, [action.provider]: action.key } };
        case 'CREATE_SESSION':
            return {
                ...state,
                sessions: [action.session, ...state.sessions],
                currentSessionId: action.session.id
            };
        case 'SELECT_SESSION':
            return { ...state, currentSessionId: action.sessionId };
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
                                m.id === action.messageId ? { ...m, content: action.content } : m
                            )
                        }
                        : s
                )
            };
        case 'TOGGLE_SIDEBAR':
            return { ...state, isSidebarOpen: !state.isSidebarOpen };
        case 'TOGGLE_SETTINGS':
            return { ...state, isSettingsOpen: !state.isSettingsOpen };
        case 'SET_THEME':
            return { ...state, theme: action.theme };
        case 'SET_TEXT_SIZE':
            return { ...state, textSize: action.size };
        case 'SET_MODEL':
            return { ...state, defaultModelConfig: action.config };
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
                    apiKeys: storedSettings.apiKeys || {},
                    theme: storedSettings.theme || 'dark', // 'system' isn't default yet, let's stick to dark/simplicity
                    textSize: storedSettings.textSize || 'medium',
                    defaultModelConfig: storedSettings.defaultModelConfig || initialState.defaultModelConfig
                };

                dispatch({ type: 'LOAD_STATE', state: loadedState });
            } catch (e) {
                console.error("Failed to load state from IDB", e);
            } finally {
                setIsHydrated(true);
            }
        };
        loadState();
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
                // Fallback
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
            await storage.saveSetting('theme', state.theme);
            await storage.saveSetting('textSize', state.textSize);
            await storage.saveSetting('defaultModelConfig', state.defaultModelConfig);
        };
        saveSettings();
    }, [state.apiKeys, state.theme, state.textSize, state.defaultModelConfig, isHydrated]);

    // Save Session Changes (Debounced manually + Force on Hide)
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const saveSessionNow = async (sessionId: string) => {
        const session = state.sessions.find(s => s.id === sessionId);
        if (session) {
            const { storage } = await import('@/services/storage');
            await storage.saveSession(session);
        }
    };

    useEffect(() => {
        if (!isHydrated) return;

        if (state.currentSessionId) {
            const session = state.sessions.find(s => s.id === state.currentSessionId);
            if (session) {
                if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

                saveTimeoutRef.current = setTimeout(() => {
                    saveSessionNow(session.id);
                    saveTimeoutRef.current = null;
                }, 1000); // 1s debounce
            }
        }
    }, [state.sessions, state.currentSessionId, isHydrated]);

    // Force save on visibility hidden (Mobile tab switching / Desktop minimize)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden' && state.currentSessionId) {
                if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                saveSessionNow(state.currentSessionId);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [state.currentSessionId, state.sessions]);

    // Note: We also need to handle DELETION from IDB. 
    // The reducer handles state, but we need a side-effect for deletion.
    // We can't easy detect deletion here without `previousState`.
    // Refactoring to Middleware pattern in future is better, but for now we'll assume `deleteSession` is rare 
    // and we might need to expose storage directly to the component calling delete, OR handling it here is tricky.
    // actually, let's keep it simple: The Sidebar delete button should probably call a helper that dispatches AND deletes from DB.
    // But to adhere to strict flux: actions should be pure.
    // Workaround: We will ignore deletion sync here and handle it where dispatch is called, OR we scan IDB vs State? Too expensive.
    // Correct fix: Add a dedicated effect for deletion? No.
    // Let's modify the Sidebar to call storage.deleteSession directly.

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
