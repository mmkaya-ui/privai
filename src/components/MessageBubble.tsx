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
        <div className={`flex gap-4 p-4 ${isUser ? 'bg-bg-base' : 'bg-bg-base'} group`}>
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-bg-highlight' : 'bg-primary'}`}>
                {isUser ? <User size={16} /> : <Bot size={16} className="text-white" />}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm">{isUser ? 'You' : 'PrivAI Assistant'}</span>
                    <span className="text-xs text-text-muted">{new Date(message.timestamp).toLocaleTimeString()}</span>
                    {message.model && <span className="text-xs bg-bg-highlight px-1 rounded text-text-muted">{message.model}</span>}
                </div>

                <div className="prose prose-invert max-w-none text-text-main">
                    {/* Render attachments first if any */}
                    {message.attachments && message.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                            {message.attachments.map((att, i) => (
                                <div key={i} className="text-xs bg-bg-highlight p-1 rounded border border-border">
                                    📎 {att.name}
                                </div>
                            ))}
                        </div>
                    )}
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={handleCopy} className="text-text-muted hover:text-text-main p-1 rounded">
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    {/* Regenerate etc can go here */}
                </div>
            </div>
        </div>
    );
});

MessageBubble.displayName = 'MessageBubble';
