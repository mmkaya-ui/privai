"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Send, X, ShieldCheck, FileText } from 'lucide-react';

interface InputAreaProps {
    onSend: (content: string, attachments: File[]) => void;
    /** Where the prompt goes: shown in the footer so the privacy label is always accurate. */
    destination?: 'local' | 'cloud';
    disabled?: boolean;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSend, disabled, destination = 'cloud' }) => {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
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

    // Drag and drop handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setAttachments(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
        }
    };

    return (
        <div
            className="p-4 sm:pb-6 max-w-3xl mx-auto w-full"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Attachments Preview */}
            {attachments.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 mb-2 px-1">
                    {attachments.map((file, i) => (
                        <div key={i} className="relative flex items-center bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 shrink-0 text-xs text-text-main gap-2">
                            <FileText size={14} className="text-primary shrink-0" />
                            <span className="truncate max-w-[160px] font-medium">{file.name}</span>
                            <span className="text-[10px] text-text-faint">({Math.round(file.size / 1024)} KB)</span>
                            <button
                                onClick={() => removeAttachment(i)}
                                className="text-white/60 hover:text-red-400 transition-colors ml-1"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] rounded-lg shrink-0 font-medium">
                        <ShieldCheck size={13} />
                        <span>Zero-Server Local RAG Active</span>
                    </div>
                </div>
            )}

            <div className={`relative glass rounded-3xl shadow-2xl transition-all duration-300 flex flex-col overflow-hidden border ${
                isDragging ? 'border-primary ring-2 ring-primary/40 bg-primary/5' : 'border-border focus-within:border-primary/50'
            }`}>
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isDragging ? "Drop files to extract their text in this tab..." : "Message PrivAI or ask about your local documents..."}
                    className="w-full bg-transparent border-none text-text-main p-4 resize-none outline-none max-h-[200px] min-h-[56px] placeholder:text-text-faint/60 text-sm leading-relaxed"
                    style={{ color: 'var(--color-text-main)' }}
                    disabled={disabled}
                    rows={1}
                />

                <div className="flex items-center justify-between p-2 pl-3 bg-bg-surface/50 border-t border-border/40">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-text-muted hover:text-text-main hover:bg-bg-surface-hover rounded-full transition-all duration-200"
                            title="Attach PDF, DOCX, Markdown, code or text. Text is extracted in this tab; matching excerpts are added to your prompt."
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
                        <span className="text-[10px] text-text-faint hidden sm:inline-flex items-center gap-1">
                            <ShieldCheck size={11} className={destination === 'local' ? 'text-emerald-400' : 'text-blue-400'} />
                            <span>{destination === 'local' ? 'Runs on this device' : 'Sent directly to the provider (no PrivAI server)'}</span>
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSend}
                            disabled={(!input.trim() && attachments.length === 0) || disabled}
                            className={`
                                p-2.5 rounded-full transition-all duration-200 flex items-center justify-center
                                ${(!input.trim() && attachments.length === 0) || disabled
                                    ? 'bg-white/5 text-text-muted cursor-not-allowed'
                                    : 'bg-gradient-to-r from-orange-400 to-amber-500 text-white hover:shadow-glow shadow-md active:scale-95 transform'}
                            `}
                        >
                            <Send size={16} className="ml-0.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
