"use client";

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '@/types/llm';
import {
    User,
    Bot,
    Copy,
    Check,
    ShieldCheck,
    Cpu,
    Pencil,
    CornerDownLeft,
    ChevronLeft,
    ChevronRight,
    FileText
} from 'lucide-react';
import { CodeBlock } from './CodeBlock';
import { formatCost } from '@/services/models';

interface MessageBubbleProps {
    message: Message;
    onEdit?: (messageId: string, newContent: string) => void;
    onSwitchVariant?: (messageId: string, variantIndex: number) => void;
}

export const MessageBubble = React.memo(({ message, onEdit, onSwitchVariant }: MessageBubbleProps) => {
    const isUser = message.role === 'user';
    const [copied, setCopied] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(message.content);
    const [showSources, setShowSources] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSaveEdit = () => {
        if (!editContent.trim()) return;
        setIsEditing(false);
        if (onEdit) {
            onEdit(message.id, editContent);
        }
    };

    const telemetry = message.telemetry;
    const isLocal = telemetry?.isLocal || (message.model && (message.model.includes('ollama') || message.model.includes('local') || message.model.includes('MLC')));

    const variants = message.variants || [];
    const currentVariantIndex = message.variantIndex ?? 0;
    const hasMultipleVariants = variants.length > 1;

    return (
        <div className={`flex gap-4 p-4 sm:p-5 rounded-2xl transition-all duration-200 ${
            isUser
                ? 'bg-bg-surface border border-border shadow-xs ml-auto max-w-[85%]'
                : 'max-w-[85%] hover:bg-bg-surface/40'
        } group`}>
            {!isUser && (
                <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${
                    isLocal ? 'bg-gradient-to-br from-emerald-500 to-teal-700' : 'bg-gradient-to-br from-indigo-500 to-purple-600'
                }`}>
                    {isLocal ? <Cpu size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
                </div>
            )}

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-sm text-text-main">
                        {isUser ? 'You' : isLocal ? 'Local Core' : 'PrivAI'}
                    </span>

                    {/* Branching tree version switcher (< 1 / 2 >) */}
                    {hasMultipleVariants && (
                        <div className="flex items-center gap-1 bg-bg-surface border border-border px-1.5 py-0.5 rounded text-[11px] font-mono text-text-muted">
                            <button
                                onClick={() => onSwitchVariant && onSwitchVariant(message.id, currentVariantIndex - 1)}
                                disabled={currentVariantIndex <= 0}
                                className="hover:text-text-main disabled:opacity-30 disabled:hover:text-text-muted transition-colors"
                                title="Previous branch"
                            >
                                <ChevronLeft size={12} />
                            </button>
                            <span>{currentVariantIndex + 1} / {variants.length}</span>
                            <button
                                onClick={() => onSwitchVariant && onSwitchVariant(message.id, currentVariantIndex + 1)}
                                disabled={currentVariantIndex >= variants.length - 1}
                                className="hover:text-text-main disabled:opacity-30 disabled:hover:text-text-muted transition-colors"
                                title="Next branch"
                            >
                                <ChevronRight size={12} />
                            </button>
                        </div>
                    )}

                    <span className="text-[10px] text-text-faint">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {!isUser && message.model && (
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium tracking-wide uppercase ${
                            isLocal ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-bg-surface border border-border text-text-muted'
                        }`}>
                            {message.model}
                        </span>
                    )}
                </div>

                {isEditing ? (
                    <div className="space-y-2 mt-2">
                        <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full bg-bg-surface border border-primary/50 rounded-xl p-3 text-sm text-text-main outline-none focus:ring-1 focus:ring-primary font-sans leading-relaxed"
                            rows={3}
                            autoFocus
                        />
                        <div className="flex items-center gap-2 justify-end">
                            <button
                                onClick={() => {
                                    setEditContent(message.content);
                                    setIsEditing(false);
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary-hover shadow-sm transition-all"
                            >
                                <CornerDownLeft size={12} />
                                <span>Save & Fork Branch</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="prose prose-invert prose-sm max-w-none text-text-main leading-relaxed">
                        {/* Attachments */}
                        {message.attachments && message.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                                {message.attachments.map((att, i) => (
                                    <div
                                        key={i}
                                        className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${att.status === 'skipped' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-white/10 border-white/5'}`}
                                        title={att.note}
                                    >
                                        📎 {att.name}{att.note ? ` — ${att.note}` : ''}
                                    </div>
                                ))}
                            </div>
                        )}

                        <ReactMarkdown
                            components={{
                                code: ({ inline, className, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
                                    return (
                                        <CodeBlock inline={inline} className={className}>
                                            {children}
                                        </CodeBlock>
                                    );
                                }
                            }}
                        >
                            {message.content}
                        </ReactMarkdown>

                        {/* Local Document Citations Pill */}
                        {message.sources && message.sources.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-border/40">
                                <button
                                    onClick={() => setShowSources(!showSources)}
                                    className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20"
                                >
                                    <FileText size={12} />
                                    <span>{message.sources.length} excerpt{message.sources.length === 1 ? '' : 's'} from your files{isLocal ? ' (stayed on this device)' : ' (sent with the prompt)'}</span>
                                </button>
                                {showSources && (
                                    <div className="mt-2 space-y-1 pl-1">
                                        {message.sources.map((src, i) => (
                                            <div key={i} className="text-[11px] text-text-muted flex items-center gap-2">
                                                <span>•</span>
                                                <span className="font-mono text-text-main">{src.filename}</span>
                                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 rounded">
                                                    {src.relevance}% match
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Telemetry Pill with Live Cost & Speed */}
                {!isUser && !isEditing && (telemetry || message.model) && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px] text-text-muted">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-surface border border-border font-mono flex-wrap shadow-xs">
                            {isLocal ? (
                                <>
                                    <ShieldCheck size={12} className="text-emerald-400" />
                                    <span className="text-emerald-400 font-bold">On this device</span>
                                    <span>•</span>
                                    <span>$0.00 Compute</span>
                                </>
                            ) : (
                                <>
                                    <ShieldCheck size={12} className="text-blue-400" />
                                    <span>Direct to provider</span>
                                    <span>•</span>
                                    <span>BYOK Direct</span>
                                </>
                            )}

                            {!!telemetry?.tokens && (
                                <>
                                    <span>•</span>
                                    <span>{telemetry.tokens} tokens</span>
                                </>
                            )}

                            {!!telemetry?.tokPerSec && (
                                <>
                                    <span>•</span>
                                    <span>{telemetry.tokPerSec} tok/s</span>
                                </>
                            )}

                            {!!telemetry?.durationMs && (
                                <>
                                    <span>•</span>
                                    <span>{(telemetry.durationMs / 1000).toFixed(1)}s</span>
                                </>
                            )}

                            {/* Estimated Cost Pill */}
                            {!isLocal && telemetry?.cost !== undefined && (
                                <>
                                    <span>•</span>
                                    <span
                                        className="text-amber-400 font-bold"
                                        title={telemetry.usageSource === 'provider' ? 'From token counts reported by the provider and its list price' : 'Token counts estimated (chars / 4)'}
                                    >
                                        {formatCost(telemetry.cost)}{telemetry.usageSource === 'provider' ? '' : ' (est.)'}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Actions */}
                {!isEditing && (
                    <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                        {isUser && onEdit && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="text-text-muted hover:text-text-main p-1 rounded-md hover:bg-bg-surface-hover transition-colors flex items-center gap-1 text-[11px]"
                                title="Edit prompt and branch"
                            >
                                <Pencil size={12} />
                                <span>Edit</span>
                            </button>
                        )}
                        <button
                            onClick={handleCopy}
                            className="text-text-muted hover:text-text-main p-1 rounded-md hover:bg-bg-surface-hover transition-colors"
                            title="Copy message"
                        >
                            {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                        </button>
                    </div>
                )}
            </div>

            {isUser && (
                <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center shadow-xs bg-primary/10 border border-primary/20 text-primary">
                    <User size={16} />
                </div>
            )}
        </div>
    );
});

MessageBubble.displayName = 'MessageBubble';
