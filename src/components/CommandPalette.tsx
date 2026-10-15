"use client";

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { AVAILABLE_MODELS, createModelConfig } from '@/services/models';
import {
    Search,
    MessageSquare,
    Sparkles,
    Cpu,
    PlusCircle,
    Trash2,
    Download,
    Settings,
    Moon,
    Sun,
    Monitor,
    Swords
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface PaletteItem {
    id: string;
    title: string;
    subtitle?: string;
    category: 'Models' | 'Chats' | 'Actions';
    icon: React.ReactNode;
    action: () => void;
}

/**
 * Mounted only while open, so every open starts with an empty query. (An earlier version cleared the
 * query 20 ms after opening, which erased anything typed straight after Ctrl+K.)
 */
export const CommandPalette = () => {
    const { state } = useApp();
    return state.isCommandPaletteOpen ? <CommandPaletteDialog /> : null;
};

const CommandPaletteDialog = () => {
    const { state, dispatch } = useApp();
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const currentSession = state.sessions.find(s => s.id === state.currentSessionId);

    // Build Action Items
    const items: PaletteItem[] = [];

    // 1. Models
    AVAILABLE_MODELS.forEach(m => {
        items.push({
            id: `model-${m.id}`,
            title: m.name,
            subtitle: m.isLocal ? 'Runs on this device' : m.description,
            category: 'Models',
            icon: m.isLocal ? <Cpu size={16} className="text-green-400" /> : <Sparkles size={16} className="text-accent-yellow" />,
            action: () => {
                dispatch({
                    type: 'SET_MODEL',
                    config: createModelConfig(m, state.defaultModelConfig.temperature)
                });
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false });
            }
        });
    });

    // 2. Chats
    state.sessions.forEach(s => {
        items.push({
            id: `chat-${s.id}`,
            title: s.title || 'Untitled Chat',
            subtitle: `${s.messages.length} messages • ${new Date(s.updatedAt).toLocaleDateString()}`,
            category: 'Chats',
            icon: <MessageSquare size={16} className="text-primary" />,
            action: () => {
                dispatch({ type: 'SELECT_SESSION', sessionId: s.id });
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false });
            }
        });
    });

    // 3. System Actions
    items.push(
        {
            id: 'action-toggle-arena',
            title: state.activeView === 'arena' ? 'Switch to Chat Workspace' : 'Switch to Battle Arena',
            subtitle: state.activeView === 'arena' ? 'Return to single-model conversational workspace' : 'Run two models simultaneously side-by-side',
            category: 'Actions',
            icon: <Swords size={16} className="text-amber-400" />,
            action: () => {
                dispatch({ type: 'SET_VIEW', view: state.activeView === 'arena' ? 'chat' : 'arena' });
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false });
            }
        },
        {
            id: 'action-new-chat',
            title: 'New Chat',
            subtitle: 'Start a fresh private conversation',
            category: 'Actions',
            icon: <PlusCircle size={16} className="text-primary" />,
            action: () => {
                const newSession = {
                    id: uuidv4(),
                    title: 'New Chat',
                    messages: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    modelConfig: state.defaultModelConfig
                };
                dispatch({ type: 'CREATE_SESSION', session: newSession });
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false });
            }
        },
        {
            id: 'action-export-md',
            title: 'Export Chat to Markdown',
            subtitle: 'Download current conversation as .md file',
            category: 'Actions',
            icon: <Download size={16} className="text-blue-400" />,
            action: () => {
                if (currentSession && currentSession.messages.length > 0) {
                    const md = currentSession.messages
                        .map(m => `### ${m.role === 'user' ? 'User' : 'Assistant'} (${new Date(m.timestamp).toLocaleTimeString()})\n\n${m.content}\n\n---\n`)
                        .join('\n');
                    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${currentSession.title.toLowerCase().replace(/\s+/g, '-')}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                }
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false });
            }
        },
        {
            id: 'action-clear-chat',
            title: 'Clear Current Context',
            subtitle: 'Wipe messages in active chat session',
            category: 'Actions',
            icon: <Trash2 size={16} className="text-red-400" />,
            action: () => {
                if (state.currentSessionId) {
                    dispatch({ type: 'CLEAR_SESSION_MESSAGES', sessionId: state.currentSessionId });
                }
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false });
            }
        },
        {
            id: 'action-settings',
            title: 'Open Settings',
            subtitle: 'Manage API keys, local endpoints & preferences',
            category: 'Actions',
            icon: <Settings size={16} className="text-text-muted" />,
            action: () => {
                dispatch({ type: 'TOGGLE_SETTINGS', open: true });
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false });
            }
        },
        {
            id: 'action-theme-dark',
            title: 'Theme: Dark Mode',
            category: 'Actions',
            icon: <Moon size={16} className="text-purple-400" />,
            action: () => {
                dispatch({ type: 'SET_THEME', theme: 'dark' });
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false });
            }
        },
        {
            id: 'action-theme-oled',
            title: 'Theme: OLED True Black',
            category: 'Actions',
            icon: <Monitor size={16} className="text-text-main" />,
            action: () => {
                dispatch({ type: 'SET_THEME', theme: 'oled' });
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false });
            }
        },
        {
            id: 'action-theme-light',
            title: 'Theme: Light Mode',
            category: 'Actions',
            icon: <Sun size={16} className="text-yellow-400" />,
            action: () => {
                dispatch({ type: 'SET_THEME', theme: 'light' });
                dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false });
            }
        }
    );

    // Filter Items
    const filteredItems = items.filter(item => {
        const fullText = `${item.title} ${item.subtitle || ''} ${item.category}`.toLowerCase();
        return fullText.includes(query.toLowerCase());
    });

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % Math.max(filteredItems.length, 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(filteredItems.length, 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const item = filteredItems[selectedIndex];
            if (item) item.action();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false });
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/75 backdrop-blur-md animate-fade-in"
            onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: false })}
        >
            <div
                className="w-full max-w-xl bg-bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[550px]"
                onClick={e => e.stopPropagation()}
            >
                {/* Search Bar */}
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-bg-surface">
                    <Search size={18} className="text-primary shrink-0" />
                    <input
                        autoFocus
                        type="text"
                        placeholder="Type a command, switch model, or search chats..."
                        value={query}
                        onChange={e => {
                            setQuery(e.target.value);
                            setSelectedIndex(0);
                        }}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-transparent text-sm text-text-main outline-none placeholder:text-text-faint"
                    />
                    <kbd className="hidden sm:inline-block text-[10px] bg-bg-base border border-border/60 text-text-muted px-2 py-0.5 rounded font-mono">
                        ESC
                    </kbd>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {filteredItems.length === 0 ? (
                        <div className="p-8 text-center text-text-muted text-sm">
                            No commands found for &ldquo;{query}&rdquo;
                        </div>
                    ) : (
                        filteredItems.map((item, idx) => {
                            const isSelected = idx === selectedIndex;
                            return (
                                <button
                                    key={item.id}
                                    onClick={item.action}
                                    onMouseEnter={() => setSelectedIndex(idx)}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors ${
                                        isSelected ? 'bg-primary text-white shadow-sm' : 'text-text-main hover:bg-bg-surface-hover'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-white/20' : 'bg-bg-base border border-border/50'}`}>
                                            {item.icon}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold truncate leading-tight">
                                                {item.title}
                                            </p>
                                            {item.subtitle && (
                                                <p className={`text-[11px] truncate leading-tight mt-0.5 ${isSelected ? 'text-white/80' : 'text-text-faint'}`}>
                                                    {item.subtitle}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${
                                        isSelected ? 'bg-white/20 text-white' : 'bg-bg-base border border-border/50 text-text-faint'
                                    }`}>
                                        {item.category}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer instructions */}
                <div className="px-4 py-2 border-t border-border bg-bg-surface flex items-center justify-between text-[11px] text-text-faint">
                    <div className="flex items-center gap-3">
                        <span>Navigate: <kbd className="font-mono bg-bg-base border border-border/60 px-1 rounded">↑</kbd> <kbd className="font-mono bg-bg-base border border-border/60 px-1 rounded">↓</kbd></span>
                        <span>Select: <kbd className="font-mono bg-bg-base border border-border/60 px-1 rounded">↵</kbd></span>
                    </div>
                    <span>PrivAI Command Engine</span>
                </div>
            </div>
        </div>
    );
};
