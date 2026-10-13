"use client";

import React from 'react';
import { useApp } from '@/lib/store';
import { PlusCircle, MessageSquare, Settings, Trash2, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Logo } from './Logo';
import { storage } from '@/services/storage';

export const Sidebar = () => {
    const { state, dispatch } = useApp();

    const handleNewChat = () => {
        const newSession = {
            id: uuidv4(),
            title: 'New Chat',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            modelConfig: state.defaultModelConfig
        };
        dispatch({ type: 'CREATE_SESSION', session: newSession });
    };

    const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this chat?')) {
            dispatch({ type: 'DELETE_SESSION', sessionId });
            await storage.deleteSession(sessionId);
        }
    };

    if (!state.isSidebarOpen) return null;

    return (
        <aside className="fixed inset-0 w-full sm:static sm:w-64 h-full bg-bg-surface flex flex-col shrink-0 z-20 border-r border-border">
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-border/40">
                <div className="flex items-center gap-2.5">
                    <Logo size={28} />
                    <h1 className="text-lg font-bold text-text-main tracking-tight">
                        PrivAI
                    </h1>
                </div>
                <button
                    onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
                    className="p-1 hover:bg-bg-highlight/50 rounded-lg text-text-muted hover:text-text-main transition-colors block sm:hidden"
                >
                    <X size={18} />
                </button>
            </div>

            {/* New Chat & Search */}
            <div className="p-3 space-y-2">
                <button
                    onClick={handleNewChat}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-primary text-white py-2.5 px-4 rounded-xl font-bold shadow-md hover:shadow-glow active:scale-[0.98] transition-all duration-150 text-sm"
                >
                    <PlusCircle size={16} />
                    <span>New Chat</span>
                </button>
                <button
                    onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: true })}
                    className="w-full flex items-center justify-between bg-bg-base hover:bg-bg-highlight/40 text-text-muted hover:text-text-main px-3 py-2 rounded-xl text-xs font-medium border border-border transition-colors"
                >
                    <span>Search or command...</span>
                    <kbd className="font-mono text-[10px] bg-bg-surface px-1.5 py-0.5 rounded border border-border text-text-faint">⌘K</kbd>
                </button>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1 custom-scrollbar">
                {state.sessions.length === 0 && (
                    <div className="text-center text-text-muted text-xs mt-12 px-4 space-y-1">
                        <p className="font-medium">No chats yet.</p>
                        <p className="text-text-faint text-[11px]">Conversations are encrypted & persisted locally.</p>
                    </div>
                )}
                {state.sessions.map(session => (
                    <div
                        key={session.id}
                        onClick={() => dispatch({ type: 'SELECT_SESSION', sessionId: session.id })}
                        className={`
                            group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border
                            ${state.currentSessionId === session.id
                                ? 'bg-primary/10 text-primary border-primary/25 shadow-sm font-semibold'
                                : 'text-text-muted hover:bg-bg-surface-hover hover:text-text-main border-transparent'}
                        `}
                    >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                            <MessageSquare size={16} className={`shrink-0 ${state.currentSessionId === session.id ? 'text-primary' : 'opacity-60'}`} />
                            <span className="truncate text-xs">{session.title}</span>
                        </div>
                        <button
                            onClick={(e) => handleDelete(e, session.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity rounded"
                            title="Delete Chat"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Footer / Settings */}
            <div className="p-3 border-t border-border/40 mt-auto">
                <button
                    onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
                    className="flex flex-col items-start gap-1 w-full p-3 text-text-main bg-bg-base/60 hover:bg-bg-surface-hover rounded-xl transition-all duration-150 border border-border/60"
                >
                    <div className="flex items-center gap-2 text-text-muted">
                        <Settings size={14} />
                        <span className="text-[11px] font-bold uppercase tracking-wider">Settings</span>
                    </div>
                    <span className="font-bold text-xs text-text-main">Zero-Telemetry AI</span>
                    <span className="text-[10px] text-text-faint">Direct BYOK & Local LLMs</span>
                </button>
            </div>
        </aside>
    );
};
