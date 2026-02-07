"use client";

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '@/types/llm';
import { User, Bot, Copy, Check } from 'lucide-react';

interface MessageBubbleProps {
    message: Message;
}

export const MessageBubble = React.memo(({ message }: MessageBubbleProps) => {
    const isUser = message.role === 'user';
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
    return (
        <div className={`flex gap-4 p-5 rounded-2xl ${isUser ? 'bg-white/5 ml-auto max-w-[80%]' : 'max-w-[80%]'} group transition-all duration-200 hover:bg-white/5`}>
            {!isUser && (
                <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center shadow-sm bg-gradient-to-br from-indigo-500 to-purple-600`}>
                    <Bot size={16} className="text-white" />
                </div>
            )}

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm text-white/90">{isUser ? 'You' : 'PrivAI'}</span>
                    <span className="text-[10px] text-text-faint">{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {!isUser && message.model && <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-text-muted font-medium uppercase tracking-wide">{message.model}</span>}
                </div>

                <div className="prose prose-invert prose-sm max-w-none text-text-main leading-relaxed">
                    {/* Render attachments first if any */}
                    {message.attachments && message.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {message.attachments.map((att, i) => (
                                <div key={i} className="text-xs bg-white/10 px-3 py-1.5 rounded-lg border border-white/5 flex items-center gap-1.5">
                                    📎 {att.name}
                                </div>
                            ))}
                        </div>
                    )}
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    <button onClick={handleCopy} className="text-text-muted hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors" title="Copy">
                        {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                </div>
            </div>

            {isUser && (
                <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center shadow-sm bg-white/10`}>
                    <User size={16} className="text-white/80" />
                </div>
            )}
        </div>
    );
});

MessageBubble.displayName = 'MessageBubble';
