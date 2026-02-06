"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="h-screen w-full flex flex-col items-center justify-center bg-bg-base text-text-main p-4 text-center">
                    <div className="bg-red-500/10 p-4 rounded-full mb-4">
                        <AlertTriangle size={48} className="text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
                    <p className="text-text-muted mb-6 max-w-md">
                        The application encountered an unexpected error. Your data is safe locally.
                    </p>
                    <div className="bg-bg-surface p-4 rounded-lg border border-border mb-6 text-left w-full max-w-lg overflow-auto max-h-40">
                        <code className="text-xs text-red-400 font-mono">
                            {this.state.error?.message}
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

        return this.props.children;
    }
}
