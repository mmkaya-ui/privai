"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/store';
import { MessageBubble } from './MessageBubble';
import { InputArea } from './InputArea';
import { Menu, Square, WifiOff, Command, PanelRightOpen, PanelRightClose, Swords } from 'lucide-react';
import { Message } from '@/types/llm';
import { v4 as uuidv4 } from 'uuid';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ModelSelector } from './ModelSelector';
import { streamChat } from '@/services/llm';

export const ChatArea = () => {
    const { state, dispatch } = useApp();
    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const isOnline = useOnlineStatus();

    const session = state.sessions.find(s => s.id === state.currentSessionId);

    // Auto-scroll logic
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

        const provider = state.defaultModelConfig.provider;
        const isLocal = provider === 'ollama' || provider === 'lmstudio' || provider === 'webllm';

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
                data: '',
                mimeType: f.type
            }))
        };
        dispatch({ type: 'ADD_MESSAGE', sessionId: state.currentSessionId, message: userMsg });

        // Offline Check (allow local models even if offline!)
        if (!isOnline && !isLocal) {
            const offlineMsg: Message = {
                id: uuidv4(),
                role: 'assistant',
                content: "⚠️ **You are offline.** Your message is saved, but Cloud AI cannot reply until you are connected. Switch to **Local Ollama** to chat 100% offline!",
                timestamp: Date.now(),
                model: 'system'
            };
            dispatch({ type: 'ADD_MESSAGE', sessionId: state.currentSessionId, message: offlineMsg });
            return;
        }

        // 2. Prepare for Generation
        const apiKey = state.apiKeys[provider] || "";
        if (!isLocal && !apiKey) {
            dispatch({ type: 'TOGGLE_SETTINGS', open: true });
            return;
        }

        const effectiveConfig = {
            ...state.defaultModelConfig,
            baseUrl: state.customBaseUrls[provider] || state.defaultModelConfig.baseUrl
        };

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

            // In-Browser Zero-Server Local Document RAG
            let promptUserMsg = userMsg;
            let detectedSources: { filename: string; relevance: number }[] | undefined = undefined;

            if (attachments.length > 0) {
                try {
                    const { parseDocument, chunkDocument, searchRelevantChunks, formatRAGContext } = await import('@/services/rag');
                    const allChunks = [];
                    for (const file of attachments) {
                        const docText = await parseDocument(file);
                        const fileChunks = chunkDocument(docText, file.name);
                        allChunks.push(...fileChunks);
                    }
                    if (allChunks.length > 0) {
                        const topChunks = searchRelevantChunks(content || "Summarize the attached document", allChunks, 4);
                        if (topChunks.length > 0) {
                            detectedSources = topChunks.map(c => ({
                                filename: c.chunk.filename,
                                relevance: Math.round(c.score * 100)
                            }));
                            promptUserMsg = {
                                ...userMsg,
                                content: `${formatRAGContext(topChunks)}\nUser Question: ${content}`
                            };
                        }
                    }
                } catch (ragErr) {
                    console.error("Local RAG processing notice:", ragErr);
                }
            }

            const fullMessages = [...history, promptUserMsg];

            await streamChat(
                fullMessages,
                effectiveConfig,
                apiKey,
                (progress) => {
                    dispatch({
                        type: 'UPDATE_MESSAGE',
                        sessionId: state.currentSessionId!,
                        messageId: aiMsgId,
                        content: progress.content,
                        telemetry: progress.telemetry,
                        sources: detectedSources
                    });
                },
                controller.signal
            );
        } catch (err: unknown) {
            const error = err as Error;
            if (error.name === 'AbortError') return;

            dispatch({
                type: 'UPDATE_MESSAGE',
                sessionId: state.currentSessionId,
                messageId: aiMsgId,
                content: `**Error**: ${error.message || 'Unknown error occurred'}`
            });
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
                setIsGenerating(false);
            }
        }
    };

    const handleEditPrompt = (messageId: string, newContent: string) => {
        if (!state.currentSessionId || !session) return;
        const msgIndex = session.messages.findIndex(m => m.id === messageId);
        if (msgIndex === -1) return;

        const originalMsg = session.messages[msgIndex];
        const prevVariants = originalMsg.variants || [originalMsg.content];
        const updatedVariants = [...prevVariants, newContent];

        const editedMsg: Message = {
            ...originalMsg,
            content: newContent,
            variants: updatedVariants,
            variantIndex: updatedVariants.length - 1
        };

        const truncated = [...session.messages.slice(0, msgIndex), editedMsg];
        dispatch({
            type: 'LOAD_STATE',
            state: {
                sessions: state.sessions.map(s =>
                    s.id === state.currentSessionId
                        ? { ...s, messages: truncated, updatedAt: Date.now() }
                        : s
                )
            }
        });

        setTimeout(() => {
            const aiMsgId = uuidv4();
            dispatch({
                type: 'ADD_MESSAGE',
                sessionId: state.currentSessionId!,
                message: {
                    id: aiMsgId,
                    role: 'assistant',
                    content: "",
                    timestamp: Date.now(),
                    model: state.defaultModelConfig.modelId
                }
            });

            const provider = state.defaultModelConfig.provider;
            const apiKey = state.apiKeys[provider] || "";
            const controller = new AbortController();
            abortControllerRef.current = controller;
            setIsGenerating(true);

            const effectiveConfig = {
                ...state.defaultModelConfig,
                baseUrl: state.customBaseUrls[provider] || state.defaultModelConfig.baseUrl
            };

            streamChat(
                truncated,
                effectiveConfig,
                apiKey,
                (progress) => {
                    dispatch({
                        type: 'UPDATE_MESSAGE',
                        sessionId: state.currentSessionId!,
                        messageId: aiMsgId,
                        content: progress.content,
                        telemetry: progress.telemetry
                    });
                },
                controller.signal
            ).catch(err => {
                if (err.name === 'AbortError') return;
                dispatch({
                    type: 'UPDATE_MESSAGE',
                    sessionId: state.currentSessionId!,
                    messageId: aiMsgId,
                    content: `**Error**: ${err.message || 'Unknown error occurred'}`
                });
            }).finally(() => {
                setIsGenerating(false);
                abortControllerRef.current = null;
            });
        }, 50);
    };

    const handleSwitchVariant = (messageId: string, variantIndex: number) => {
        if (!state.currentSessionId) return;
        dispatch({
            type: 'SWITCH_MESSAGE_VARIANT',
            sessionId: state.currentSessionId,
            messageId,
            variantIndex
        });
    };

    if (!session) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-4 bg-bg-base text-center">
                <div className="max-w-md space-y-6">
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        PrivAI
                    </h2>
                    <p className="text-text-muted text-sm leading-relaxed">
                        Secure, zero-telemetry AI workspace with native Local Ollama and BYOK endpoints.
                        Your conversations never leave your device.
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
                    {!isOnline && (
                        <p className="text-yellow-500 font-medium text-xs flex items-center justify-center gap-2">
                            <WifiOff size={14} /> Offline mode: Switch to Local Ollama for 100% offline chat
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-bg-base relative transition-colors duration-300 min-w-0">
            {/* Header */}
            <header className="px-6 py-3.5 flex items-center justify-between shrink-0 z-20 sticky top-0 border-b border-border/40 bg-bg-base/80 backdrop-blur-md">
                <div className="flex items-center gap-3 min-w-0">
                    {!state.isSidebarOpen && (
                        <button
                            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
                            className="p-2 text-text-muted hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <Menu size={18} />
                        </button>
                    )}
                    <ModelSelector />
                </div>

                <div className="flex items-center gap-2">
                    {/* Battle Arena Switcher */}
                    <button
                        onClick={() => dispatch({ type: 'SET_VIEW', view: 'arena' })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 text-xs font-bold transition-colors"
                        title="Open Multi-Model Battle Arena"
                    >
                        <Swords size={13} />
                        <span className="hidden sm:inline">Battle Arena</span>
                    </button>

                    {/* Command Palette Trigger */}
                    <button
                        onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE', open: true })}
                        className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-border text-xs text-text-muted hover:text-text-main transition-colors"
                        title="Open Command Palette (Ctrl+K / ⌘K)"
                    >
                        <Command size={13} />
                        <span className="font-mono text-[11px]">⌘K</span>
                    </button>

                    {/* Canvas Toggle */}
                    {state.activeArtifact && (
                        <button
                            onClick={() => {
                                if (state.isArtifactOpen) {
                                    dispatch({ type: 'CLOSE_ARTIFACT' });
                                } else if (state.activeArtifact) {
                                    dispatch({ type: 'OPEN_ARTIFACT', artifact: state.activeArtifact });
                                }
                            }}
                            className={`p-1.5 rounded-lg border transition-colors ${
                                state.isArtifactOpen
                                    ? 'bg-primary/20 text-primary border-primary/40'
                                    : 'bg-white/5 text-text-muted hover:text-text-main border-border'
                            }`}
                            title="Toggle Artifact Canvas"
                        >
                            {state.isArtifactOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                        </button>
                    )}

                    {!isOnline && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 text-yellow-500 text-xs font-medium rounded-full border border-yellow-500/20">
                            <WifiOff size={12} />
                            <span>Offline</span>
                        </div>
                    )}

                    {isGenerating && (
                        <button
                            onClick={stopGeneration}
                            className="flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-400/10 px-3 py-1.5 rounded-full hover:bg-red-400/20 transition-colors"
                        >
                            <Square size={10} fill="currentColor" />
                            <span>Stop</span>
                        </button>
                    )}
                </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar scroll-smooth" ref={scrollRef}>
                <div className="max-w-3xl mx-auto space-y-6 pb-4 h-full flex flex-col">
                    {session.messages.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center -mt-16 text-center px-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center mb-4 shadow-glow">
                                <Command size={24} className="text-white" />
                            </div>
                            <h3 className="text-2xl sm:text-3xl font-bold mb-2 text-text-main">
                                Private by Design. Intelligent by Nature.
                            </h3>
                            <p className="text-xs sm:text-sm text-text-muted max-w-md">
                                Type a prompt below or press <kbd className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-[11px] text-primary">⌘K</kbd> to quick-switch models or execute commands.
                            </p>
                        </div>
                    ) : (
                        session.messages.map(m => (
                            <MessageBubble
                                key={m.id}
                                message={m}
                                onEdit={handleEditPrompt}
                                onSwitchVariant={handleSwitchVariant}
                            />
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
