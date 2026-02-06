"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/store';
import { MessageBubble } from './MessageBubble';
import { InputArea } from './InputArea';
import { Menu, Square, WifiOff } from 'lucide-react';
import { Message } from '@/types/llm';
import { v4 as uuidv4 } from 'uuid';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export const ChatArea = () => {
    const { state, dispatch } = useApp();
    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const isOnline = useOnlineStatus();

    const session = state.sessions.find(s => s.id === state.currentSessionId);

    // Auto-scroll logic needs to be smart: only if already near bottom
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [session?.messages.length, session?.id]);

    const stopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsGenerating(false);
        }
    };

    const handleSend = async (content: string, attachments: File[]) => {
        if (!state.currentSessionId) return;

        const currentSession = state.sessions.find(s => s.id === state.currentSessionId);
        if (!currentSession) return;

        // 1. Add User Message
        const userMsg: Message = {
            id: uuidv4(),
            role: 'user',
            content,
            timestamp: Date.now(),
            attachments: attachments.map(f => ({
                id: uuidv4(),
                type: f.type.startsWith('image') ? 'image' : 'file',
                name: f.name,
                data: '', // TODO: Convert to base64
                mimeType: f.type
            }))
        };
        dispatch({ type: 'ADD_MESSAGE', sessionId: state.currentSessionId, message: userMsg });

        // Offline Check
        if (!isOnline) {
            const offlineMsg: Message = {
                id: uuidv4(),
                role: 'assistant',
                content: "⚠️ **You are offline.** Your message is saved, but AI cannot reply until you are connected.",
                timestamp: Date.now(),
                model: 'system'
            };
            dispatch({ type: 'ADD_MESSAGE', sessionId: state.currentSessionId, message: offlineMsg });
            return;
        }

        // 2. Prepare for Generation
        const apiKey = state.apiKeys[state.defaultModelConfig.provider];
        if (!apiKey) {
            dispatch({ type: 'TOGGLE_SETTINGS' });
            return;
        }

        const aiMsgId = uuidv4();
        dispatch({
            type: 'ADD_MESSAGE',
            sessionId: state.currentSessionId,
            message: {
                id: aiMsgId,
                role: 'assistant',
                content: "",
                timestamp: Date.now(),
                model: state.defaultModelConfig.modelId
            }
        });

        // Abort previous
        if (abortControllerRef.current) abortControllerRef.current.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsGenerating(true);

        try {
            const history = currentSession.messages.slice(-10);
            const fullMessages = [...history, userMsg];

            const { streamChat } = await import('@/services/llm');

            await streamChat(
                fullMessages,
                state.defaultModelConfig,
                apiKey,
                (content) => {
                    dispatch({
                        type: 'UPDATE_MESSAGE',
                        sessionId: state.currentSessionId!,
                        messageId: aiMsgId,
                        content
                    });
                },
                controller.signal
            );
        } catch (err: any) {
            if (err.name === 'AbortError') return;

            dispatch({
                type: 'UPDATE_MESSAGE',
                sessionId: state.currentSessionId,
                messageId: aiMsgId,
                content: `**Error**: ${err.message || 'Unknown error occurred'}`
            });
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
                setIsGenerating(false);
            }
        }
    };

    if (!session) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-4 bg-bg-base text-center">
                <div className="max-w-md space-y-6">
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        PrivAI
                    </h2>
                    <p className="text-text-muted">
                        Secure, private, enterprise-grade AI chat.
                        Your data stays on your device.
                    </p>
                    <button
                        onClick={() => {
                            const newSession = {
                                id: uuidv4(),
                                title: 'New Chat',
                                messages: [],
                                createdAt: Date.now(),
                                updatedAt: Date.now(),
                                modelConfig: state.defaultModelConfig
                            };
                            dispatch({ type: 'CREATE_SESSION', session: newSession });
                        }}
                        className="btn btn-primary w-full py-3 shadow-lg hover:shadow-primary/20"
                    >
                        Start New Chat
                    </button>
                    {!isOnline && <p className="text-yellow-500 font-medium text-sm flex items-center justify-center gap-2"><WifiOff size={14} /> You are currently offline</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-bg-base relative transition-colors duration-300">
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0 bg-base-80 backdrop-blur-md z-10 sticky top-0">
                <div className="flex items-center gap-3">
                    {!state.isSidebarOpen && (
                        <button
                            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
                            className="p-2 text-text-muted hover:text-text-main hover:bg-bg-surface-hover rounded-lg"
                        >
                            <Menu size={20} />
                        </button>
                    )}
                    <div className="flex flex-col">
                        <span className="text-xs text-text-muted font-mono uppercase">Model</span>
                        <h2 className="font-bold text-sm sm:text-base flex items-center gap-2">
                            {state.defaultModelConfig.modelId}
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {!isOnline && (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 text-yellow-500 text-xs font-medium rounded-full border border-yellow-500/20 animate-pulse">
                            <WifiOff size={12} />
                            <span>Offline</span>
                        </div>
                    )}
                    {isGenerating && (
                        <button
                            onClick={stopGeneration}
                            className="flex items-center gap-2 text-xs font-bold text-red-400 bg-red-400/10 px-3 py-1.5 rounded-full hover:bg-red-400/20 transition-colors"
                        >
                            <Square size={10} fill="currentColor" />
                            STOP
                        </button>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar scroll-smooth" ref={scrollRef}>
                <div className="max-w-3xl mx-auto space-y-6 pb-4">
                    {session.messages.length === 0 ? (
                        <div className="text-center py-20 text-text-muted opacity-50">
                            <h3 className="text-xl font-medium mb-2">Private. Secure. Powerful.</h3>
                            <p className="text-sm">Start typing to begin.</p>
                        </div>
                    ) : (
                        session.messages.map(m => (
                            <MessageBubble key={m.id} message={m} />
                        ))
                    )}
                    <div ref={bottomRef} className="h-4" />
                </div>
            </div>

            {/* Input */}
            <div className="p-4 shrink-0 z-20">
                <InputArea onSend={handleSend} disabled={isGenerating} />
            </div>
        </div>
    );
};
