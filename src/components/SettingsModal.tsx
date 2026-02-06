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
        { id: 'openai', name: 'OpenAI (ChatGPT)' },
        { id: 'anthropic', name: 'Anthropic (Claude)' },
        { id: 'gemini', name: 'Google Gemini' },
        { id: 'deepseek', name: 'DeepSeek' },
        { id: 'kimi', name: 'Kimi (Moonshot)' },
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-bg-base border border-border rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-xl font-bold">Settings</h2>
                    <button
                        onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
                        className="p-1 hover:bg-bg-surface-hover rounded"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 space-y-4">
                    <div className="space-y-4">
                        <h3 className="font-semibold text-text-muted text-sm uppercase tracking-wider">API Keys (Stored Locally)</h3>
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
