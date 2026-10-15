"use client";

import React, { useState, useRef } from 'react';
import { useApp } from '@/lib/store';
import { AVAILABLE_MODELS, AIModelDefinition, createModelConfig } from '@/services/models';
import { streamChat } from '@/services/llm';
import { Swords, Play, Square, Trophy, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { CodeBlock } from './CodeBlock';

interface ModelOutputState {
    content: string;
    isGenerating: boolean;
    tokens: number;
    tokPerSec: number;
    durationMs: number;
    ttftMs: number;
    cost: number;
    usageSource?: 'provider' | 'estimated';
    error?: string;
    isWinner?: boolean;
}

const initialOutputState: ModelOutputState = {
    content: '',
    isGenerating: false,
    tokens: 0,
    tokPerSec: 0,
    durationMs: 0,
    ttftMs: 0,
    cost: 0,
};

export const ArenaView = () => {
    const { state, dispatch } = useApp();
    const [modelA, setModelA] = useState<AIModelDefinition>(AVAILABLE_MODELS[0]); // e.g. Llama 3.3 Local
    const [modelB, setModelB] = useState<AIModelDefinition>(
        AVAILABLE_MODELS.find(m => m.id === 'deepseek-chat') || AVAILABLE_MODELS[1]
    );

    const [prompt, setPrompt] = useState('');
    const [outputA, setOutputA] = useState<ModelOutputState>(initialOutputState);
    const [outputB, setOutputB] = useState<ModelOutputState>(initialOutputState);
    const [copiedA, setCopiedA] = useState(false);
    const [copiedB, setCopiedB] = useState(false);

    const abortA = useRef<AbortController | null>(null);
    const abortB = useRef<AbortController | null>(null);

    const isRunning = outputA.isGenerating || outputB.isGenerating;

    const stopAll = () => {
        abortA.current?.abort();
        abortB.current?.abort();
        setOutputA(prev => ({ ...prev, isGenerating: false }));
        setOutputB(prev => ({ ...prev, isGenerating: false }));
    };

    const handleBattle = async () => {
        if (!prompt.trim() || isRunning) return;

        setOutputA({ ...initialOutputState, isGenerating: true });
        setOutputB({ ...initialOutputState, isGenerating: true });

        const messages = [{ id: '1', role: 'user' as const, content: prompt, timestamp: Date.now() }];

        // Model A Execution
        const keyA = state.apiKeys[modelA.providerId] || '';
        const configA = createModelConfig(modelA, 0.7, state.customBaseUrls[modelA.providerId]);
        const ctrlA = new AbortController();
        abortA.current = ctrlA;

        // Model B Execution
        const keyB = state.apiKeys[modelB.providerId] || '';
        const configB = createModelConfig(modelB, 0.7, state.customBaseUrls[modelB.providerId]);
        const ctrlB = new AbortController();
        abortB.current = ctrlB;

        const runA = streamChat(
            messages,
            configA,
            keyA,
            (progress) => {
                const t = progress.telemetry;
                setOutputA(prev => ({
                    ...prev,
                    content: progress.content,
                    tokens: t?.tokens || 0,
                    tokPerSec: t?.tokPerSec || 0,
                    durationMs: t?.durationMs || 0,
                    ttftMs: t?.ttftMs ?? prev.ttftMs,
                    cost: t?.cost ?? 0,
                    usageSource: t?.usageSource
                }));
            },
            ctrlA.signal
        ).catch(err => {
            if (err.name !== 'AbortError') {
                setOutputA(prev => ({ ...prev, error: err.message }));
            }
        }).finally(() => {
            setOutputA(prev => ({ ...prev, isGenerating: false }));
        });

        const runB = streamChat(
            messages,
            configB,
            keyB,
            (progress) => {
                const t = progress.telemetry;
                setOutputB(prev => ({
                    ...prev,
                    content: progress.content,
                    tokens: t?.tokens || 0,
                    tokPerSec: t?.tokPerSec || 0,
                    durationMs: t?.durationMs || 0,
                    ttftMs: t?.ttftMs ?? prev.ttftMs,
                    cost: t?.cost ?? 0,
                    usageSource: t?.usageSource
                }));
            },
            ctrlB.signal
        ).catch(err => {
            if (err.name !== 'AbortError') {
                setOutputB(prev => ({ ...prev, error: err.message }));
            }
        }).finally(() => {
            setOutputB(prev => ({ ...prev, isGenerating: false }));
        });

        await Promise.all([runA, runB]);
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-bg-base overflow-hidden">
            {/* Arena Header */}
            <header className="px-6 py-4 border-b border-border bg-bg-surface flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-md">
                        <Swords size={18} className="text-white" />
                    </div>
                    <div>
                        <h2 className="font-bold text-base text-text-main flex items-center gap-2">
                            Multi-Model Battle Arena
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase font-black">
                                Realtime Head-to-Head
                            </span>
                        </h2>
                        <p className="text-[11px] text-text-faint">
                            Prompt two models simultaneously • Compare speed, latency, depth & cost
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => dispatch({ type: 'SET_VIEW', view: 'chat' })}
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-border text-xs font-semibold text-text-main transition-colors flex items-center gap-1.5"
                    >
                        <span>← Back to Chat</span>
                    </button>

                    {isRunning && (
                        <button
                            onClick={stopAll}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold hover:bg-red-500/30 transition-colors"
                        >
                            <Square size={12} fill="currentColor" />
                            <span>Stop Battle</span>
                        </button>
                    )}
                </div>
            </header>

            {/* Battle Columns */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border overflow-hidden">
                {/* Side A */}
                <div className="flex flex-col h-full overflow-hidden bg-bg-base/50">
                    <div className="p-3.5 border-b border-border/80 bg-bg-surface/80 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-wider text-amber-400">Contender A</span>
                            <select
                                value={modelA.id}
                                onChange={(e) => {
                                    const m = AVAILABLE_MODELS.find(x => x.id === e.target.value);
                                    if (m) setModelA(m);
                                }}
                                className="bg-bg-surface border border-border rounded-lg px-2.5 py-1 text-xs font-bold text-text-main outline-none"
                            >
                                {AVAILABLE_MODELS.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>

                        {outputA.content && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setOutputA(prev => ({ ...prev, isWinner: true }));
                                        setOutputB(prev => ({ ...prev, isWinner: false }));
                                    }}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                                        outputA.isWinner ? 'bg-amber-500 text-white shadow-glow' : 'text-text-muted hover:text-amber-400'
                                    }`}
                                >
                                    <Trophy size={12} />
                                    <span>Winner</span>
                                </button>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(outputA.content);
                                        setCopiedA(true);
                                        setTimeout(() => setCopiedA(false), 2000);
                                    }}
                                    className="p-1 rounded text-text-muted hover:text-white"
                                >
                                    {copiedA ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Telemetry Bar A */}
                    {(outputA.tokens > 0 || outputA.isGenerating) && (
                        <div className="px-4 py-2 bg-white/5 border-b border-border/50 flex items-center gap-3 text-[11px] font-mono text-text-muted flex-wrap">
                            <span className="text-emerald-400 font-bold">{outputA.tokens} tokens</span>
                            <span>•</span>
                            <span>{outputA.tokPerSec} tok/s</span>
                            {outputA.ttftMs > 0 && (
                                <>
                                    <span>•</span>
                                    <span>TTFT: {outputA.ttftMs}ms</span>
                                </>
                            )}
                            <span>•</span>
                            <span>{(outputA.durationMs / 1000).toFixed(1)}s</span>
                            <span>•</span>
                            <span className="text-amber-400">${outputA.cost.toFixed(5)}</span>
                            {outputA.usageSource === 'estimated' && <span title="Provider did not report usage; chars/4 estimate">(est.)</span>}
                        </div>
                    )}

                    {/* Content A */}
                    <div className="flex-1 overflow-y-auto p-5 custom-scrollbar text-sm leading-relaxed prose prose-invert max-w-none">
                        {outputA.error ? (
                            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                                <strong>Error:</strong> {outputA.error}
                            </div>
                        ) : outputA.content ? (
                            <ReactMarkdown
                                components={{
                                    code: ({ inline, className, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => (
                                        <CodeBlock inline={inline} className={className}>{children}</CodeBlock>
                                    )
                                }}
                            >
                                {outputA.content}
                            </ReactMarkdown>
                        ) : (
                            <div className="h-full flex items-center justify-center text-text-faint text-xs italic">
                                Waiting for battle prompt...
                            </div>
                        )}
                    </div>
                </div>

                {/* Side B */}
                <div className="flex flex-col h-full overflow-hidden bg-bg-base/50">
                    <div className="p-3.5 border-b border-border/80 bg-bg-surface/80 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-wider text-blue-400">Contender B</span>
                            <select
                                value={modelB.id}
                                onChange={(e) => {
                                    const m = AVAILABLE_MODELS.find(x => x.id === e.target.value);
                                    if (m) setModelB(m);
                                }}
                                className="bg-bg-surface border border-border rounded-lg px-2.5 py-1 text-xs font-bold text-text-main outline-none"
                            >
                                {AVAILABLE_MODELS.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>

                        {outputB.content && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setOutputB(prev => ({ ...prev, isWinner: true }));
                                        setOutputA(prev => ({ ...prev, isWinner: false }));
                                    }}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                                        outputB.isWinner ? 'bg-amber-500 text-white shadow-glow' : 'text-text-muted hover:text-amber-400'
                                    }`}
                                >
                                    <Trophy size={12} />
                                    <span>Winner</span>
                                </button>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(outputB.content);
                                        setCopiedB(true);
                                        setTimeout(() => setCopiedB(false), 2000);
                                    }}
                                    className="p-1 rounded text-text-muted hover:text-white"
                                >
                                    {copiedB ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Telemetry Bar B */}
                    {(outputB.tokens > 0 || outputB.isGenerating) && (
                        <div className="px-4 py-2 bg-white/5 border-b border-border/50 flex items-center gap-3 text-[11px] font-mono text-text-muted flex-wrap">
                            <span className="text-blue-400 font-bold">{outputB.tokens} tokens</span>
                            <span>•</span>
                            <span>{outputB.tokPerSec} tok/s</span>
                            {outputB.ttftMs > 0 && (
                                <>
                                    <span>•</span>
                                    <span>TTFT: {outputB.ttftMs}ms</span>
                                </>
                            )}
                            <span>•</span>
                            <span>{(outputB.durationMs / 1000).toFixed(1)}s</span>
                            <span>•</span>
                            <span className="text-amber-400">${outputB.cost.toFixed(5)}</span>
                            {outputB.usageSource === 'estimated' && <span title="Provider did not report usage; chars/4 estimate">(est.)</span>}
                        </div>
                    )}

                    {/* Content B */}
                    <div className="flex-1 overflow-y-auto p-5 custom-scrollbar text-sm leading-relaxed prose prose-invert max-w-none">
                        {outputB.error ? (
                            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                                <strong>Error:</strong> {outputB.error}
                            </div>
                        ) : outputB.content ? (
                            <ReactMarkdown
                                components={{
                                    code: ({ inline, className, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => (
                                        <CodeBlock inline={inline} className={className}>{children}</CodeBlock>
                                    )
                                }}
                            >
                                {outputB.content}
                            </ReactMarkdown>
                        ) : (
                            <div className="h-full flex items-center justify-center text-text-faint text-xs italic">
                                Waiting for battle prompt...
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Arena Input Bar */}
            <div className="p-4 border-t border-border bg-bg-surface shrink-0">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                    <input
                        type="text"
                        placeholder="Enter comparison prompt (e.g. Write a quicksort algorithm in Rust, Explain quantum entanglement)..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleBattle();
                        }}
                        disabled={isRunning}
                        className="flex-1 bg-bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text-main outline-none focus:border-primary transition-all placeholder:text-text-faint"
                    />
                    <button
                        onClick={handleBattle}
                        disabled={!prompt.trim() || isRunning}
                        className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white transition-all ${
                            !prompt.trim() || isRunning
                                ? 'bg-white/10 text-text-muted cursor-not-allowed'
                                : 'bg-gradient-to-r from-amber-500 to-red-600 shadow-lg hover:shadow-glow active:scale-95'
                        }`}
                    >
                        <Play size={16} fill="currentColor" />
                        <span>Battle</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
