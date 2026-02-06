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
        <aside className="fixed inset-0 w-full sm:static sm:w-64 h-full bg-bg-surface border-r border-border flex flex-col transition-all duration-300 ease-in-out shrink-0 z-20">
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Logo size={28} />
                    <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        PrivAI
                    </h1>
                </div>
                <button
                    onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
                    className="p-1 hover:bg-bg-highlight rounded text-text-muted block"
                >
                    <X size={20} />
                </button>
            </div>

            {/* New Chat */}
            <div className="p-3">
                <button
                    onClick={handleNewChat}
                    className="w-full flex items-center gap-2 bg-primary hover:bg-primary-hover text-white p-3 rounded-lg transition-colors font-medium shadow-sm active:scale-95 transform duration-100"
                >
                    <PlusCircle size={20} />
                    <span>New Chat</span>
                </button>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 custom-scrollbar">
                {state.sessions.length === 0 && (
                    <div className="text-center text-text-muted text-sm mt-10 px-4">
                        <p>No chats yet.</p>
                        <p className="text-xs text-text-faint mt-2">Your history is stored privately on this device.</p>
                    </div>
                )}
                {state.sessions.map(session => (
                    <div
                        key={session.id}
                        onClick={() => dispatch({ type: 'SELECT_SESSION', sessionId: session.id })}
                        className={`
                            group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border border-transparent
                            ${state.currentSessionId === session.id
                                ? 'bg-bg-highlight text-text-main shadow-sm border-border-highlight'
                                : 'text-text-muted hover:bg-bg-surface-hover hover:text-text-main'}
                        `}
                    >
                        <div className="flex items-center gap-3 overflow-hidden">
                            <MessageSquare size={18} className="shrink-0" />
                            <span className="truncate text-sm font-medium">{session.title}</span>
                        </div>
                        <button
                            onClick={(e) => handleDelete(e, session.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                            title="Delete Chat"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Footer / Motto */}
            <div className="p-4 border-t border-border mt-auto bg-bg-surface">
                <button
                    onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
                    className="flex items-center gap-3 w-full p-2 text-text-muted hover:text-text-main hover:bg-bg-surface-hover rounded-lg transition-colors mb-4"
                >
                    <Settings size={20} />
                    <span>Settings</span>
                </button>

                <div className="text-center">
                    <p className="text-[10px] uppercase tracking-widest text-text-faint font-bold">
                        Private by Design
                    </p>
                    <p className="text-[10px] text-text-faint mt-1 italic">
                        Intelligent by Nature
                    </p>
                </div>
            </div>
        </aside>
    );
};
