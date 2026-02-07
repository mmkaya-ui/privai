"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Send, X, Mic, Image as ImageIcon } from 'lucide-react';
import styles from './Components.module.css'; // Optional usage if specific styles needed

interface InputAreaProps {
    onSend: (content: string, attachments: File[]) => void;
    disabled?: boolean;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSend, disabled }) => {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<File[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
    }, [input]);

    const handleSend = () => {
        if ((!input.trim() && attachments.length === 0) || disabled) return;
        onSend(input, attachments);
        setInput('');
        setAttachments([]);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    return (
        <div className="p-4 bg-bg-base border-t border-border">
            <div className="max-w-3xl mx-auto">
                {/* Attachments Preview */}
                {attachments.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                        {attachments.map((file, i) => (
                            <div key={i} className="relative flex items-center bg-bg-surface p-2 rounded-lg border border-border shrink-0">
                                <span className="text-sm truncate max-w-[150px]">{file.name}</span>
                                <button
                                    onClick={() => removeAttachment(i)}
                                    className="ml-2 text-text-muted hover:text-red-400"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="relative bg-bg-surface border border-border rounded-2xl shadow-lg focus-within:border-primary focus-within:shadow-glow transition-all duration-300 flex flex-col overflow-hidden">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Message PrivAI..."
                        className="w-full bg-transparent border-none text-text-main p-4 resize-none outline-none max-h-[200px] min-h-[56px] placeholder:text-text-faint"
                        style={{ color: 'var(--color-text-main)' }}
                        disabled={disabled}
                        rows={1}
                    />

                    <div className="flex items-center justify-between p-3 border-t border-border bg-bg-surface-hover">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2.5 text-text-muted hover:text-text-main hover:bg-bg-highlight rounded-xl transition-all duration-200"
                            >
                                <Paperclip size={20} />
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                multiple
                                onChange={handleFileSelect}
                            />
                            {/* <button className="p-2 text-text-muted hover:text-text-main hover:bg-bg-surface-hover rounded-lg transition-colors">
                                <ImageIcon size={20} />
                            </button> */}
                        </div>

                        <div className="flex items-center gap-3">
                            <small className="text-text-faint text-xs hidden sm:block">
                                Enter to send, Shift+Enter for new line
                            </small>
                            <button
                                onClick={handleSend}
                                disabled={(!input.trim() && attachments.length === 0) || disabled}
                                className={`
                                    p-2.5 rounded-xl transition-all duration-200
                                    ${(!input.trim() && attachments.length === 0) || disabled
                                        ? 'bg-bg-highlight text-text-muted cursor-not-allowed'
                                        : 'bg-gradient-primary text-white hover:shadow-glow shadow-md active:scale-95 transform'}
                                `}
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="text-center mt-2">
                    <p className="text-xs text-text-faint">AI can make mistakes. Please verify important information.</p>
                </div>
            </div>
        </div>
    );
};
