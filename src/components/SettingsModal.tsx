"use client";

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { X, Save, Eye, EyeOff } from 'lucide-react';

export const SettingsModal = () => {
    const { state, dispatch } = useApp();
    const [keys, setKeys] = useState(state.apiKeys);
    const [showKey, setShowKey] = useState<Record<string, boolean>>({});

    if (!state.isSettingsOpen) return null;

    const providers = [
        { id: 'groq', name: 'Groq (Free - get key at console.groq.com)' },
        { id: 'openai', name: 'OpenAI (ChatGPT)' },
        { id: 'anthropic', name: 'Anthropic (Claude)' },
        { id: 'gemini', name: 'Google Gemini' },
        { id: 'deepseek', name: 'DeepSeek' },
    ];

    const handleSave = () => {
        Object.entries(keys).forEach(([provider, key]) => {
            dispatch({ type: 'SET_API_KEY', provider, key });
        });
        dispatch({ type: 'TOGGLE_SETTINGS' });
    };

    const toggleShow = (id: string) => {
        setShowKey(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black-60 backdrop-blur-sm p-4">
            <div className="bg-bg-base border border-border rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-90vh">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-bold">Settings</h2>
                    <button
                        onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
                        className="p-1 hover:bg-bg-surface-hover rounded"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 space-y-6">
                    {/* Appearance */}
                    <div className="space-y-3">
                        <h3 className="font-semibold text-text-muted text-sm uppercase tracking-wider">Appearance</h3>

                        {/* Theme */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium block">Theme</label>
                            <div className="grid grid-cols-4 gap-2">
                                {(['light', 'dark', 'oled', 'system'] as const).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => dispatch({ type: 'SET_THEME', theme: t })}
                                        className={`
                                            px-2 py-2 rounded-lg text-xs font-medium border transition-colors capitalize
                                            ${state.theme === t
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-bg-surface border-border text-text-muted hover:border-border-highlight hover:text-text-main'}
                                        `}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Text Size */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium block flex justify-between">
                                <span>Text Size</span>
                                <span className="text-text-muted text-xs uppercase">{state.textSize}</span>
                            </label>
                            <div className="flex bg-bg-surface border border-border rounded-lg p-1">
                                {(['small', 'medium', 'large', 'xlarge'] as const).map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => dispatch({ type: 'SET_TEXT_SIZE', size: s })}
                                        className={`
                                            flex-1 py-1.5 rounded-md text-xs font-medium transition-all
                                            ${state.textSize === s
                                                ? 'bg-bg-highlight text-text-main shadow-sm'
                                                : 'text-text-muted hover:text-text-main'}
                                        `}
                                    >
                                        {s === 'small' ? 'Aa' : s === 'medium' ? 'Aa' : s === 'large' ? 'Aa' : 'Aa'}
                                        <span className={`block text-[8px] opacity-60 ${s === 'small' ? 'scale-75' : s === 'large' ? 'scale-110' : s === 'xlarge' ? 'scale-125' : ''}`}>
                                            {s.charAt(0).toUpperCase()}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-semibold text-text-muted text-sm uppercase tracking-wider">API Keys</h3>
                        {providers.map(p => (
                            <div key={p.id} className="space-y-1">
                                <label className="text-sm font-medium block">{p.name}</label>
                                <div className="relative">
                                    <input
                                        type={showKey[p.id] ? "text" : "password"}
                                        className="input pr-10"
                                        placeholder={`sk-...`}
                                        value={keys[p.id] || ''}
                                        onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })}
                                    />
                                    <button
                                        onClick={() => toggleShow(p.id)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
                                    >
                                        {showKey[p.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-border bg-bg-surface rounded-b-xl flex justify-end">
                    <button
                        onClick={handleSave}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <Save size={18} />
                        Save & Close
                    </button>
                </div>
            </div>
        </div>
    );
};
