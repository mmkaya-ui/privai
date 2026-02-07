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
        <div className="p-4 sm:pb-6 max-w-3xl mx-auto w-full">
            {/* Attachments Preview */}
            {attachments.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 mb-2 px-1">
                    {attachments.map((file, i) => (
                        <div key={i} className="relative flex items-center bg-white/10 backdrop-blur-md p-2 rounded-lg border border-white/10 shrink-0">
                            <span className="text-sm truncate max-w-[150px] text-white/90">{file.name}</span>
                            <button
                                onClick={() => removeAttachment(i)}
                                className="ml-2 text-white/60 hover:text-red-400 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="relative glass rounded-3xl shadow-2xl focus-within:ring-1 focus-within:ring-white/20 transition-all duration-300 flex flex-col overflow-hidden">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Topic..."
                    className="w-full bg-transparent border-none text-text-main p-4 resize-none outline-none max-h-[200px] min-h-[56px] placeholder:text-text-faint/60"
                    style={{ color: 'var(--color-text-main)' }}
                    disabled={disabled}
                    rows={1}
                />

                <div className="flex items-center justify-between p-2 pl-3 bg-white/5 border-t border-white/5">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-text-muted hover:text-white hover:bg-white/10 rounded-full transition-all duration-200"
                            title="Attach file"
                        >
                            <Paperclip size={18} />
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            multiple
                            onChange={handleFileSelect}
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-[10px] text-text-faint hidden sm:block">
                            AI can make mistakes. Please verify important information.
                        </span>
                        <button
                            onClick={handleSend}
                            disabled={(!input.trim() && attachments.length === 0) || disabled}
                            className={`
                                p-2 rounded-full transition-all duration-200 flex items-center justify-center
                                ${(!input.trim() && attachments.length === 0) || disabled
                                    ? 'bg-white/5 text-text-muted cursor-not-allowed'
                                    : 'bg-gradient-to-r from-orange-400 to-amber-500 text-white hover:shadow-glow shadow-md active:scale-95 transform'}
                            `}
                        >
                            <Send size={16} className={(!input.trim() && attachments.length === 0) ? "ml-0.5" : "ml-0.5"} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
