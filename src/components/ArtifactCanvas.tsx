"use client";

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { X, Copy, Check, Download, Eye, Code, Maximize2, Minimize2 } from 'lucide-react';

export const ArtifactCanvas = () => {
    const { state, dispatch } = useApp();
    const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
    const [isCopied, setIsCopied] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const artifact = state.activeArtifact;
    if (!state.isArtifactOpen || !artifact) return null;

    const isPreviewable = ['html', 'svg', 'javascript', 'js'].includes(artifact.language.toLowerCase());

    const handleCopy = () => {
        navigator.clipboard.writeText(artifact.content);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleDownload = () => {
        const extMap: Record<string, string> = {
            html: 'html',
            svg: 'svg',
            typescript: 'ts',
            tsx: 'tsx',
            javascript: 'js',
            jsx: 'jsx',
            python: 'py',
            json: 'json',
            css: 'css',
            markdown: 'md'
        };
        const ext = extMap[artifact.language.toLowerCase()] || 'txt';
        const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${artifact.title.toLowerCase().replace(/\s+/g, '-')}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Render HTML in sandboxed iframe with base styles
    const generatePreviewHtml = () => {
        if (artifact.language.toLowerCase() === 'svg') {
            return `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f1117; padding: 20px; box-sizing: border-box; }
                        svg { max-width: 100%; max-height: 80vh; height: auto; }
                    </style>
                </head>
                <body>
                    ${artifact.content}
                </body>
                </html>
            `;
        }

        // Full HTML document
        if (artifact.content.includes('<html') || artifact.content.includes('<!DOCTYPE')) {
            return artifact.content;
        }

        // Snippet wrapped in responsive container
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 1.5rem; background: #0b0f19; color: #f3f4f6; }
                </style>
            </head>
            <body>
                ${artifact.content}
            </body>
            </html>
        `;
    };

    return (
        <aside
            className={`
                h-full border-l border-border bg-bg-surface flex flex-col z-30 transition-all duration-300 shadow-2xl
                ${isFullscreen ? 'fixed inset-0 w-full' : 'w-full md:w-[480px] lg:w-[560px]'}
            `}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-surface">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                        ARTIFACT
                    </span>
                    <h3 className="font-bold text-sm text-text-main truncate">
                        {artifact.title}
                    </h3>
                </div>

                <div className="flex items-center gap-2">
                    {/* View Switcher */}
                    {isPreviewable && (
                        <div className="flex bg-bg-base border border-border rounded-lg p-0.5">
                            <button
                                onClick={() => setViewMode('preview')}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                                    viewMode === 'preview' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'
                                }`}
                            >
                                <Eye size={12} />
                                <span>Preview</span>
                            </button>
                            <button
                                onClick={() => setViewMode('code')}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                                    viewMode === 'code' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'
                                }`}
                            >
                                <Code size={12} />
                                <span>Code</span>
                            </button>
                        </div>
                    )}

                    <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
                        title="Copy code"
                    >
                        {isCopied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                    </button>

                    <button
                        onClick={handleDownload}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
                        title="Download file"
                    >
                        <Download size={16} />
                    </button>

                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
                        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>

                    <button
                        onClick={() => dispatch({ type: 'CLOSE_ARTIFACT' })}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/10 transition-colors"
                        title="Close Canvas"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Canvas Body */}
            <div className="flex-1 overflow-hidden relative bg-[#0b0f19]">
                {viewMode === 'preview' && isPreviewable ? (
                    <iframe
                        title={artifact.title}
                        srcDoc={generatePreviewHtml()}
                        sandbox="allow-scripts allow-modals"
                        className="w-full h-full border-none bg-white/5"
                    />
                ) : (
                    <div className="w-full h-full overflow-auto p-4 custom-scrollbar text-[13px] font-mono leading-relaxed">
                        <pre className="!bg-transparent !p-0 !m-0">
                            <code>{artifact.content}</code>
                        </pre>
                    </div>
                )}
            </div>
        </aside>
    );
};
