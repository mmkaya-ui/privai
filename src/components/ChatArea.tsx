"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/store';
import { MessageBubble } from './MessageBubble';
import { ErrorBoundary } from './ErrorBoundary';
import { InputArea } from './InputArea';
import { Menu, Square, WifiOff, Command, PanelRightOpen, PanelRightClose, Swords, Cpu, Zap, Key, BookOpen, ShieldCheck } from 'lucide-react';
import type { Attachment, Message } from '@/types/llm';
import type { DocumentChunk } from '@/services/rag';
import { buildPromptHistory } from '@/services/history';
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

    /** Stream a reply into `aiMsgId`, recording errors and early stops as non-conversational turns. */
    const runCompletion = async (
        sessionId: string,
        aiMsgId: string,
        history: Message[],
        sources?: { filename: string; relevance: number }[]
    ) => {
        const provider = state.defaultModelConfig.provider;
        const apiKey = state.apiKeys[provider] || "";
        const effectiveConfig = {
            ...state.defaultModelConfig,
            baseUrl: state.customBaseUrls[provider] || state.defaultModelConfig.baseUrl
        };

        if (abortControllerRef.current) abortControllerRef.current.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsGenerating(true);

        let streamed = "";
        try {
            await streamChat(
                history,
                effectiveConfig,
                apiKey,
                (progress) => {
                    streamed = progress.content;
                    dispatch({
                        type: 'UPDATE_MESSAGE',
                        sessionId,
                        messageId: aiMsgId,
                        content: progress.content,
                        telemetry: progress.telemetry,
                        sources
                    });
                },
                controller.signal
            );
        } catch (err: unknown) {
            const error = err as Error;
            if (error.name === 'AbortError') {
                dispatch(streamed
                    ? { type: 'UPDATE_MESSAGE', sessionId, messageId: aiMsgId, content: streamed, status: 'stopped' }
                    : { type: 'UPDATE_MESSAGE', sessionId, messageId: aiMsgId, content: '_Stopped before the model replied._', status: 'notice' });
                return;
            }
            dispatch({
                type: 'UPDATE_MESSAGE',
                sessionId,
                messageId: aiMsgId,
                content: `**Error**: ${error.message || 'Unknown error occurred'}`,
                status: 'error'
            });
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
                setIsGenerating(false);
            }
        }
    };

    const handleSend = async (content: string, files: File[]) => {
        const sessionId = state.currentSessionId;
        if (!sessionId) return;
        const currentSession = state.sessions.find(s => s.id === sessionId);
        if (!currentSession) return;

        const provider = state.defaultModelConfig.provider;
        const isLocal = provider === 'ollama' || provider === 'lmstudio' || provider === 'webllm';

        // 1. Extract text from attachments in this tab. Unsupported files are reported, never guessed at.
        let promptContent = content;
        let detectedSources: { filename: string; relevance: number }[] | undefined;
        const attachments: Attachment[] = [];
        if (files.length > 0) {
            setIsGenerating(true);
            try {
                const { extractAttachmentText } = await import('@/services/attachments');
                const { chunkDocument, selectContextChunks, formatRAGContext } = await import('@/services/rag');
                const allChunks: DocumentChunk[] = [];
                for (const file of files) {
                    const base: Attachment = {
                        id: uuidv4(),
                        type: file.type.startsWith('image') ? 'image' : 'file',
                        name: file.name,
                        data: '',
                        mimeType: file.type
                    };
                    const result = await extractAttachmentText(file);
                    if (result.ok) {
                        allChunks.push(...chunkDocument(result.text, file.name));
                        attachments.push({ ...base, status: 'used', note: 'text extracted in browser' });
                    } else {
                        attachments.push({ ...base, status: 'skipped', note: `not sent: ${result.reason}` });
                    }
                }
                const top = selectContextChunks(content || "Summarize the attached document", allChunks, 4);
                if (top.length > 0) {
                    detectedSources = top.map(c => ({ filename: c.chunk.filename, relevance: Math.round(c.score * 100) }));
                    promptContent = `${formatRAGContext(top)}\nUser Question: ${content}`;
                }
            } finally {
                setIsGenerating(false);
            }
        }

        // 2. Add the user message (the chat shows what the user typed; the prompt carries the excerpts).
        const userMsg: Message = {
            id: uuidv4(),
            role: 'user',
            content,
            timestamp: Date.now(),
            ...(attachments.length > 0 && { attachments })
        };
        dispatch({ type: 'ADD_MESSAGE', sessionId, message: userMsg });

        // Offline: cloud models can't answer (local models still can).
        if (!isOnline && !isLocal) {
            dispatch({
                type: 'ADD_MESSAGE',
                sessionId,
                message: {
                    id: uuidv4(),
                    role: 'assistant',
                    content: "⚠️ **You are offline.** Your message is saved, but cloud models cannot reply until you are connected. Local models (Ollama, LM Studio, in-browser WebGPU) still work offline.",
                    timestamp: Date.now(),
                    model: 'system',
                    status: 'notice'
                }
            });
            return;
        }

        if (!isLocal && !state.apiKeys[provider]) {
            dispatch({ type: 'TOGGLE_SETTINGS', open: true });
            return;
        }

        const aiMsgId = uuidv4();
        dispatch({
            type: 'ADD_MESSAGE',
            sessionId,
            message: { id: aiMsgId, role: 'assistant', content: "", timestamp: Date.now(), model: state.defaultModelConfig.modelId }
        });

        const history = buildPromptHistory([...currentSession.messages, { ...userMsg, content: promptContent }]);
        await runCompletion(sessionId, aiMsgId, history, detectedSources);
    };

    const handleEditPrompt = (messageId: string, newContent: string) => {
        const sessionId = state.currentSessionId;
        if (!sessionId || !session) return;
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
                    s.id === sessionId ? { ...s, messages: truncated, updatedAt: Date.now() } : s
                )
            }
        });

        const aiMsgId = uuidv4();
        dispatch({
            type: 'ADD_MESSAGE',
            sessionId,
            message: { id: aiMsgId, role: 'assistant', content: "", timestamp: Date.now(), model: state.defaultModelConfig.modelId }
        });
        void runCompletion(sessionId, aiMsgId, buildPromptHistory(truncated));
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
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-bg-base text-center overflow-y-auto custom-scrollbar">
                <div className="max-w-xl w-full space-y-6">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                            <ShieldCheck size={13} />
                            <span>No PrivAI server • No analytics</span>
                        </div>
                        <h2 className="text-3xl font-extrabold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent tracking-tight">
                            PrivAI Workspace
                        </h2>
                        <p className="text-text-muted text-sm leading-relaxed max-w-md mx-auto">
                            There is no PrivAI server: prompts go straight from this tab to the provider you choose, or stay
                            on your machine with Ollama, LM Studio or in-browser WebGPU. Chats are kept in this browser.
                        </p>
                    </div>

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
                        className="btn btn-primary w-full py-3.5 shadow-lg hover:shadow-primary/20 font-bold text-sm tracking-wide"
                    >
                        Start New Chat
                    </button>

                    {/* 3 Interactive Mode Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-left">
                        {/* Card 1: Local Ollama */}
                        <div
                            onClick={() => dispatch({ type: 'TOGGLE_SETTINGS', open: true })}
                            className="group p-4 rounded-2xl bg-bg-surface hover:bg-bg-surface-hover border border-border hover:border-emerald-500/50 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between"
                        >
                            <div>
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3 border border-emerald-500/20">
                                    <Cpu size={16} />
                                </div>
                                <h4 className="text-xs font-bold text-text-main group-hover:text-emerald-300 transition-colors">
                                    Local Machine AI
                                </h4>
                                <p className="text-[11px] text-text-muted mt-1 leading-snug">
                                    Connect to Ollama or LM Studio on localhost. Prompts never leave your machine.
                                </p>
                            </div>
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 mt-3 pt-2 border-t border-border/40">
                                <BookOpen size={10} /> Setup Guide →
                            </span>
                        </div>

                        {/* Card 2: WebGPU */}
                        <div
                            onClick={() => {
                                const newSession = {
                                    id: uuidv4(),
                                    title: 'WebGPU Chat',
                                    messages: [],
                                    createdAt: Date.now(),
                                    updatedAt: Date.now(),
                                    modelConfig: {
                                        provider: 'webllm' as const,
                                        modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
                                        temperature: 0.7
                                    }
                                };
                                dispatch({ type: 'CREATE_SESSION', session: newSession });
                            }}
                            className="group p-4 rounded-2xl bg-bg-surface hover:bg-bg-surface-hover border border-border hover:border-blue-500/50 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between"
                        >
                            <div>
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 mb-3 border border-blue-500/20">
                                    <Zap size={16} />
                                </div>
                                <h4 className="text-xs font-bold text-text-main group-hover:text-blue-300 transition-colors">
                                    In-Browser WebGPU
                                </h4>
                                <p className="text-[11px] text-text-muted mt-1 leading-snug">
                                    Run Llama 3.2 in this browser tab. No install; weights download once from Hugging Face.
                                </p>
                            </div>
                            <span className="text-[10px] font-bold text-blue-400 mt-3 pt-2 border-t border-border/40 block">
                                Launch in Tab →
                            </span>
                        </div>

                        {/* Card 3: Cloud BYOK */}
                        <div
                            onClick={() => dispatch({ type: 'TOGGLE_SETTINGS', open: true })}
                            className="group p-4 rounded-2xl bg-bg-surface hover:bg-bg-surface-hover border border-border hover:border-purple-500/50 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between"
                        >
                            <div>
                                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 mb-3 border border-purple-500/20">
                                    <Key size={16} />
                                </div>
                                <h4 className="text-xs font-bold text-text-main group-hover:text-purple-300 transition-colors">
                                    Wholesale BYOK
                                </h4>
                                <p className="text-[11px] text-text-muted mt-1 leading-snug">
                                    Claude, GPT, Gemini, DeepSeek, Groq at pay-per-token API prices.
                                </p>
                            </div>
                            <span className="text-[10px] font-bold text-purple-400 mt-3 pt-2 border-t border-border/40 block">
                                Enter Keys →
                            </span>
                        </div>
                    </div>

                    {!isOnline && (
                        <p className="text-yellow-400 font-medium text-xs flex items-center justify-center gap-2 bg-yellow-500/10 border border-yellow-500/20 py-2 rounded-xl">
                            <WifiOff size={14} /> You are currently offline. Local Ollama & WebGPU work 100% offline!
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
                            <ErrorBoundary key={m.id} label="Message" variant="inline" resetKeys={[m.content]}>
                                <MessageBubble
                                    message={m}
                                    onEdit={handleEditPrompt}
                                    onSwitchVariant={handleSwitchVariant}
                                />
                            </ErrorBoundary>
                        ))
                    )}
                    <div ref={bottomRef} className="h-4" />
                </div>
            </div>

            {/* Input */}
            <div className="p-4 shrink-0 z-20">
                <InputArea
                    onSend={handleSend}
                    disabled={isGenerating}
                    destination={['ollama', 'lmstudio', 'webllm'].includes(state.defaultModelConfig.provider) ? 'local' : 'cloud'}
                />
            </div>
        </div>
    );
};
