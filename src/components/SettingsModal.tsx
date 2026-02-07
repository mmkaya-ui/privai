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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black-60 p-4">
            <div className="bg-glass rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-90vh overflow-hidden border border-border animate-fade-in shadow-xl">
                <div className="flex items-center justify-between p-5 border-b border-border bg-white/5">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Settings</h2>
                    <button
                        onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors text-text-muted hover:text-text-main"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-8">
                    {/* Appearance */}
                    <section className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary">Appearance</h3>

                        {/* Theme */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold block text-text-main">Interface Theme</label>
                            <div className="grid grid-cols-4 gap-2">
                                {(['light', 'dark', 'oled', 'system'] as const).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => dispatch({ type: 'SET_THEME', theme: t })}
                                        className={`
                                            px-2 py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 capitalize
                                            ${state.theme === t
                                                ? 'bg-gradient-primary text-white border-transparent shadow-glow'
                                                : 'bg-bg-surface border-border text-text-muted hover:bg-bg-highlight hover:text-text-main'}
                                        `}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Text Size */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold block flex justify-between">
                                <span className="text-text-main">Typography Scale</span>
                                <span className="text-primary text-[10px] font-black uppercase tracking-widest">{state.textSize}</span>
                            </label>
                            <div className="flex bg-bg-surface border border-border rounded-xl p-1.5 shadow-inner">
                                {(['small', 'medium', 'large', 'xlarge'] as const).map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => dispatch({ type: 'SET_TEXT_SIZE', size: s })}
                                        className={`
                                            flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200
                                            ${state.textSize === s
                                                ? 'bg-bg-highlight text-text-main shadow-md ring-1 ring-border'
                                                : 'text-text-muted hover:text-text-main'}
                                        `}
                                    >
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className={`${s === 'small' ? 'text-[10px]' : s === 'medium' ? 'text-sm' : s === 'large' ? 'text-base' : 'text-lg'}`}>Aa</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary">Intelligence</h3>
                        </div>
                        {providers.map(p => (
                            <div key={p.id} className="space-y-2">
                                <label className="text-sm font-semibold block text-text-main">{p.name}</label>
                                <div className="relative group">
                                    <input
                                        type={showKey[p.id] ? "text" : "password"}
                                        className="w-full bg-bg-surface border border-border rounded-xl p-3.5 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all duration-200"
                                        placeholder={`Enter API Key for ${p.id}...`}
                                        value={keys[p.id] || ''}
                                        onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })}
                                    />
                                    <button
                                        onClick={() => toggleShow(p.id)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-1 rounded-lg transition-colors"
                                    >
                                        {showKey[p.id] ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </section>
                </div>

                <footer className="p-5 border-t border-border bg-white/5 flex justify-end gap-3">
                    <button
                        onClick={handleSave}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-primary text-white py-3.5 rounded-xl font-bold shadow-lg hover:shadow-glow transition-all duration-200 active:scale-[0.98]"
                    >
                        <Save size={20} />
                        Synchronize Settings
                    </button>
                </footer>
            </div>
        </div>
    );
};
