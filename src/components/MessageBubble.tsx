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
        <div className={`flex gap-4 p-5 ${isUser ? 'bg-bg-base' : 'bg-bg-surface'} group transition-colors duration-200 hover:bg-bg-surface-hover`}>
            <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center shadow-md ${isUser ? 'bg-bg-highlight' : 'bg-gradient-primary'}`}>
                {isUser ? <User size={18} className="text-text-muted" /> : <Bot size={18} className="text-white" />}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-sm text-text-main">{isUser ? 'You' : 'PrivAI Assistant'}</span>
                    <span className="text-xs text-text-faint">{new Date(message.timestamp).toLocaleTimeString()}</span>
                    {message.model && <span className="text-xs bg-bg-highlight px-2 py-0.5 rounded-full text-text-muted font-medium">{message.model}</span>}
                </div>

                <div className="prose prose-invert max-w-none text-text-main leading-relaxed">
                    {/* Render attachments first if any */}
                    {message.attachments && message.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {message.attachments.map((att, i) => (
                                <div key={i} className="text-xs bg-bg-highlight px-3 py-1.5 rounded-lg border border-border flex items-center gap-1.5">
                                    📎 {att.name}
                                </div>
                            ))}
                        </div>
                    )}
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    <button onClick={handleCopy} className="text-text-muted hover:text-text-main p-1.5 rounded-lg hover:bg-bg-highlight transition-colors">
                        {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    </button>
                    {/* Regenerate etc can go here */}
                </div>
            </div>
        </div>
    );
});

MessageBubble.displayName = 'MessageBubble';
