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
        <aside className="fixed inset-0 w-full sm:static sm:w-64 h-full glass flex flex-col transition-all duration-300 ease-in-out shrink-0 z-20 border-r-0">
            {/* Header */}
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Logo size={28} />
                    <h1 className="text-xl font-bold text-white tracking-wide">
                        PrivAI
                    </h1>
                </div>
                <button
                    onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
                    className="p-1 hover:bg-white/10 rounded text-text-muted block"
                >
                    <X size={20} />
                </button>
            </div>

            {/* New Chat */}
            <div className="px-3 pb-2">
                <button
                    onClick={handleNewChat}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-primary text-white p-3.5 rounded-xl font-semibold shadow-lg hover:shadow-glow active:scale-95 transform transition-all duration-200 border border-white/10"
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
                                ? 'bg-white/10 text-white shadow-sm border-white/10 backdrop-blur-sm'
                                : 'text-text-muted hover:bg-white/5 hover:text-white'}
                        `}
                    >
                        <div className="flex items-center gap-3 overflow-hidden">
                            <MessageSquare size={18} className="shrink-0 opacity-70" />
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
            <div className="p-4 mt-auto">
                <button
                    onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
                    className="flex flex-col items-start gap-1 w-full p-4 text-text-main bg-white/5 hover:bg-white/10 rounded-xl transition-all duration-200 mb-6 border border-white/5 backdrop-blur-md"
                >
                    <div className="flex items-center gap-2 text-text-muted mb-1">
                        <Settings size={16} />
                        <span className="text-xs font-semibold uppercase tracking-wider">Settings</span>
                    </div>
                    <span className="font-bold text-sm">PRIVATE BY DESIGN</span>
                    <span className="text-[10px] text-text-faint">Intelligent by Nature</span>
                </button>
            </div>
        </aside>
    );
};
