"use client";

import React, { useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import { Copy, Check, Download, Eye, Terminal } from 'lucide-react';
import { useApp } from '@/lib/store';

interface CodeBlockProps {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
}

export const CodeBlock = ({ inline, className, children }: CodeBlockProps) => {
    const { dispatch } = useApp();
    const [copied, setCopied] = useState(false);

    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1].toLowerCase() : '';
    const codeString = String(children || '').replace(/\n$/, '');

    // Highlight code with Prism synchronously using useMemo
    const highlightedHtml = React.useMemo(() => {
        if (inline || !codeString) return '';
        try {
            const grammar = Prism.languages[language] || Prism.languages.javascript || Prism.languages.clike;
            if (grammar) {
                return Prism.highlight(codeString, grammar, language || 'javascript');
            }
        } catch {
            // fallback to plain text if highlighting fails
        }
        return '';
    }, [codeString, language, inline]);

    if (inline) {
        return (
            <code className="bg-bg-highlight/80 text-primary px-1.5 py-0.5 rounded text-xs font-mono border border-border/50">
                {children}
            </code>
        );
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(codeString);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const extMap: Record<string, string> = {
            typescript: 'ts',
            tsx: 'tsx',
            javascript: 'js',
            jsx: 'jsx',
            python: 'py',
            html: 'html',
            css: 'css',
            json: 'json',
            bash: 'sh',
            sql: 'sql',
            markdown: 'md'
        };
        const ext = extMap[language] || 'txt';
        const blob = new Blob([codeString], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `privai-snippet-${Date.now()}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const isPreviewable = ['html', 'svg', 'jsx', 'tsx', 'javascript', 'js'].includes(language);

    const handleOpenInCanvas = () => {
        dispatch({
            type: 'OPEN_ARTIFACT',
            artifact: {
                id: `art-${Date.now()}`,
                title: `${language.toUpperCase()} Snippet`,
                language: language || 'text',
                content: codeString,
                type: language === 'html' ? 'html' : language === 'svg' ? 'svg' : 'code'
            }
        });
    };

    return (
        <div className="my-4 rounded-xl overflow-hidden border border-border bg-[#0d1117] shadow-xl group">
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-border/60 text-xs text-text-muted">
                <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-primary" />
                    <span className="font-mono font-bold uppercase tracking-wider text-[11px] text-text-main">
                        {language || 'TEXT'}
                    </span>
                    <span className="text-[10px] text-text-faint">
                        ({codeString.split('\n').length} lines)
                    </span>
                </div>

                <div className="flex items-center gap-1.5">
                    {isPreviewable && (
                        <button
                            onClick={handleOpenInCanvas}
                            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
                            title="Open in Canvas Sandbox"
                        >
                            <Eye size={13} />
                            <span>Preview</span>
                        </button>
                    )}

                    <button
                        onClick={handleDownload}
                        className="p-1.5 rounded hover:bg-white/10 text-text-muted hover:text-text-main transition-colors"
                        title="Download file"
                    >
                        <Download size={13} />
                    </button>

                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 text-[11px] font-medium text-text-muted hover:text-text-main transition-colors"
                        title="Copy code"
                    >
                        {copied ? (
                            <>
                                <Check size={13} className="text-green-400" />
                                <span className="text-green-400 font-bold">Copied</span>
                            </>
                        ) : (
                            <>
                                <Copy size={13} />
                                <span>Copy</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Code Content */}
            <div className="p-4 overflow-x-auto text-[13px] font-mono leading-relaxed custom-scrollbar">
                {highlightedHtml ? (
                    <pre className="!bg-transparent !p-0 !m-0">
                        <code
                            className={`language-${language}`}
                            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                        />
                    </pre>
                ) : (
                    <pre className="!bg-transparent !p-0 !m-0">
                        <code>{codeString}</code>
                    </pre>
                )}
            </div>
        </div>
    );
};
