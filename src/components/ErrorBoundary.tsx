"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
    /** Shown in the fallback and logs, e.g. "Chat", "Artifact canvas". */
    label?: string;
    /**
     * page   – full-screen (root of the app)
     * panel  – fills its container (sidebar, chat, canvas, modal)
     * inline – small strip (a single message)
     */
    variant?: "page" | "panel" | "inline";
    /** When any of these change, the boundary resets automatically (e.g. switching chats). */
    resetKeys?: unknown[];
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

const keysChanged = (a: unknown[] = [], b: unknown[] = []) =>
    a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Local console only — PrivAI ships no error-reporting SDK.
        console.error(`Uncaught error${this.props.label ? ` in ${this.props.label}` : ""}:`, error, errorInfo);
    }

    public componentDidUpdate(prevProps: Props) {
        if (this.state.hasError && keysChanged(prevProps.resetKeys, this.props.resetKeys)) {
            this.reset();
        }
    }

    private reset = () => {
        this.props.onReset?.();
        this.setState({ hasError: false, error: null });
    };

    public render() {
        if (!this.state.hasError) return this.props.children;
        if (this.props.fallback) return this.props.fallback;

        const { variant = "page", label } = this.props;
        const message = this.state.error?.message || "Unknown error";

        if (variant === "inline") {
            return (
                <div role="alert" className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span className="truncate">{label ? `${label} failed to render` : "Failed to render"}: {message}</span>
                    <button onClick={this.reset} className="ml-auto underline hover:text-red-300 shrink-0">Retry</button>
                </div>
            );
        }

        if (variant === "panel") {
            return (
                <div role="alert" className="flex-1 h-full w-full flex flex-col items-center justify-center gap-3 p-6 text-center bg-bg-base text-text-main">
                    <AlertTriangle size={28} className="text-red-500" />
                    <p className="font-semibold">{label ? `${label} crashed` : "This panel crashed"}</p>
                    <code className="text-xs text-red-400 font-mono max-w-md break-words">{message}</code>
                    <button onClick={this.reset} className="btn btn-primary flex items-center gap-2 text-sm">
                        <RefreshCcw size={14} /> Try again
                    </button>
                </div>
            );
        }

        return (
            <div role="alert" className="h-screen w-full flex flex-col items-center justify-center bg-bg-base text-text-main p-4 text-center">
                <div className="bg-red-500/10 p-4 rounded-full mb-4">
                    <AlertTriangle size={48} className="text-red-500" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
                <p className="text-text-muted mb-6 max-w-md">
                    The application encountered an unexpected error. Your data is safe locally.
                </p>
                <div className="bg-bg-surface p-4 rounded-lg border border-border mb-6 text-left w-full max-w-lg overflow-auto max-h-40">
                    <code className="text-xs text-red-400 font-mono">
                        {message}
                    </code>
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <RefreshCcw size={18} />
                    Reload Application
                </button>
            </div>
        );
    }
}
