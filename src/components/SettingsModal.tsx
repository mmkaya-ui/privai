"use client";

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import {
    X,
    Save,
    Eye,
    EyeOff,
    Cpu,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Globe,
    Shield,
    Lock,
    Download,
    Upload,
    BookOpen,
    ChevronDown,
    ExternalLink
} from 'lucide-react';
import { checkOllamaConnection } from '@/services/ollama';
import { encryptData, decryptData, EncryptedPrivAIPayload } from '@/services/crypto';
import { storage } from '@/services/storage';

export const SettingsModal = () => {
    const { state, dispatch } = useApp();
    const [keys, setKeys] = useState(state.apiKeys);
    const [baseUrls, setBaseUrls] = useState(state.customBaseUrls);
    const [showKey, setShowKey] = useState<Record<string, boolean>>({});
    const [activeTab, setActiveTab] = useState<'local' | 'cloud' | 'security' | 'appearance'>('local');

    // Local LLM connection status
    const [isTestingOllama, setIsTestingOllama] = useState(false);
    const [ollamaStatus, setOllamaStatus] = useState<{ checked: boolean; ok: boolean; message: string }>({
        checked: false,
        ok: false,
        message: ''
    });
    const [showOllamaGuide, setShowOllamaGuide] = useState(false);

    // Zero-Knowledge Encrypted Backup State
    const [exportPassphrase, setExportPassphrase] = useState('');
    const [importPassphrase, setImportPassphrase] = useState('');
    const [importFile, setImportFile] = useState<File | null>(null);
    const [backupStatus, setBackupStatus] = useState<{ message: string; ok: boolean } | null>(null);
    const [isProcessingBackup, setIsProcessingBackup] = useState(false);

    if (!state.isSettingsOpen) return null;

    const cloudProviders = [
        { id: 'groq', name: 'Groq (Free)', desc: 'High-speed cloud LPUs. Get key at console.groq.com' },
        { id: 'anthropic', name: 'Anthropic (Claude)', desc: 'Claude 3.5 Sonnet / Haiku. Direct browser access enabled' },
        { id: 'openai', name: 'OpenAI (GPT-4o / o3-mini)', desc: 'OpenAI official API or compatible endpoints' },
        { id: 'deepseek', name: 'DeepSeek (V3 / R1)', desc: 'DeepSeek cloud API key' },
        { id: 'gemini', name: 'Google Gemini', desc: 'Gemini 1.5 Pro / Flash API key' },
    ];

    const handleSave = () => {
        // Save API Keys
        Object.entries(keys).forEach(([provider, key]) => {
            dispatch({ type: 'SET_API_KEY', provider, key });
        });
        // Save Custom Base URLs
        Object.entries(baseUrls).forEach(([provider, url]) => {
            dispatch({ type: 'SET_CUSTOM_BASE_URL', provider, url });
        });
        dispatch({ type: 'TOGGLE_SETTINGS', open: false });
    };

    const toggleShow = (id: string) => {
        setShowKey(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleTestOllama = async () => {
        setIsTestingOllama(true);
        const url = baseUrls.ollama || 'http://localhost:11434';
        const res = await checkOllamaConnection(url);
        setIsTestingOllama(false);
        if (res.ok) {
            setOllamaStatus({
                checked: true,
                ok: true,
                message: `Connected! Found ${res.models.length} model(s): ${res.models.slice(0, 3).join(', ')}${res.models.length > 3 ? '...' : ''}`
            });
        } else {
            setOllamaStatus({
                checked: true,
                ok: false,
                message: res.error || 'Connection failed'
            });
        }
    };

    // Export AES-256-GCM Encrypted Backup
    const handleExportBackup = async () => {
        if (!exportPassphrase || exportPassphrase.length < 4) {
            setBackupStatus({ ok: false, message: 'Passphrase must be at least 4 characters long.' });
            return;
        }

        try {
            setIsProcessingBackup(true);
            setBackupStatus(null);

            const sessions = await storage.getSessions();
            const exportPayload = {
                sessions,
                settings: {
                    apiKeys: keys,
                    customBaseUrls: baseUrls,
                    theme: state.theme,
                    textSize: state.textSize,
                    defaultModelConfig: state.defaultModelConfig
                },
                exportedAt: Date.now()
            };

            const encrypted = await encryptData(exportPayload, exportPassphrase);

            const blob = new Blob([JSON.stringify(encrypted, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const dateStr = new Date().toISOString().slice(0, 10);
            a.download = `privai-encrypted-backup-${dateStr}.privai`;
            a.click();
            URL.revokeObjectURL(url);

            setBackupStatus({
                ok: true,
                message: `Successfully encrypted and downloaded backup (${sessions.length} chats).`
            });
            setExportPassphrase('');
        } catch (err: unknown) {
            setBackupStatus({ ok: false, message: (err as Error).message || 'Export failed.' });
        } finally {
            setIsProcessingBackup(false);
        }
    };

    // Restore AES-256-GCM Encrypted Backup
    const handleImportBackup = async () => {
        if (!importFile) {
            setBackupStatus({ ok: false, message: 'Please select a .privai backup file first.' });
            return;
        }
        if (!importPassphrase) {
            setBackupStatus({ ok: false, message: 'Please enter the decryption passphrase.' });
            return;
        }

        try {
            setIsProcessingBackup(true);
            setBackupStatus(null);

            const rawText = await importFile.text();
            const payload: EncryptedPrivAIPayload = JSON.parse(rawText);

            interface PrivAIBackupContent {
                version?: number;
                sessions?: typeof state.sessions;
                settings?: {
                    apiKeys?: Record<string, string>;
                    customBaseUrls?: Record<string, string>;
                };
            }

            const decrypted = await decryptData<PrivAIBackupContent>(payload, importPassphrase);

            if (!decrypted || !decrypted.sessions) {
                throw new Error('Invalid backup structure.');
            }

            // Restore sessions to IndexedDB
            for (const sess of decrypted.sessions) {
                await storage.saveSession(sess);
            }

            // Restore settings if present
            if (decrypted.settings) {
                if (decrypted.settings.apiKeys) {
                    setKeys(decrypted.settings.apiKeys);
                    await storage.saveSetting('apiKeys', decrypted.settings.apiKeys);
                }
                if (decrypted.settings.customBaseUrls) {
                    setBaseUrls(decrypted.settings.customBaseUrls);
                    await storage.saveSetting('customBaseUrls', decrypted.settings.customBaseUrls);
                }
            }

            // Update app state
            dispatch({
                type: 'LOAD_STATE',
                state: {
                    sessions: decrypted.sessions,
                    apiKeys: decrypted.settings?.apiKeys || keys,
                    customBaseUrls: decrypted.settings?.customBaseUrls || baseUrls
                }
            });

            setBackupStatus({
                ok: true,
                message: `Successfully restored ${decrypted.sessions.length} conversations from encrypted backup!`
            });
            setImportFile(null);
            setImportPassphrase('');
        } catch (err: unknown) {
            setBackupStatus({ ok: false, message: (err as Error).message || 'Decryption failed. Check passphrase.' });
        } finally {
            setIsProcessingBackup(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fade-in">
            <div className="bg-bg-surface rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-border">
                {/* Header */}
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-bg-surface">
                    <div className="flex items-center gap-2.5">
                        <h2 className="text-base sm:text-lg font-bold text-text-main">PrivAI Settings</h2>
                        <span className="text-[10px] bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                            Zero-Telemetry
                        </span>
                    </div>
                    <button
                        onClick={() => dispatch({ type: 'TOGGLE_SETTINGS', open: false })}
                        className="p-1.5 hover:bg-bg-highlight/50 rounded-xl transition-colors text-text-muted hover:text-text-main"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Navigation Tabs */}
                <div className="flex border-b border-border bg-bg-base/40 px-4 pt-2 gap-2 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('local')}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                            activeTab === 'local'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-text-muted hover:text-text-main'
                        }`}
                    >
                        <Cpu size={14} />
                        <span>Local LLMs & URLs</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('cloud')}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                            activeTab === 'cloud'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-text-muted hover:text-text-main'
                        }`}
                    >
                        <Globe size={14} />
                        <span>Cloud API Keys</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('security')}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                            activeTab === 'security'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-text-muted hover:text-text-main'
                        }`}
                    >
                        <Lock size={14} />
                        <span>Encrypted Backups</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('appearance')}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                            activeTab === 'appearance'
                                ? 'border-primary text-primary'
                                : 'border-transparent text-text-muted hover:text-text-main'
                        }`}
                    >
                        <span>Appearance</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
                    {/* Tab: Local LLMs */}
                    {activeTab === 'local' && (
                        <div className="space-y-5">
                            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 leading-relaxed">
                                <strong>Native Zero-Telemetry Mode:</strong> Run LLMs directly on your laptop using Ollama or LM Studio. Zero network packets will ever leave your computer.
                            </div>

                            {/* Ollama Host */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-semibold text-text-main">Ollama Endpoint URL</label>
                                    <button
                                        type="button"
                                        onClick={handleTestOllama}
                                        disabled={isTestingOllama}
                                        className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                                    >
                                        <RefreshCw size={11} className={isTestingOllama ? 'animate-spin' : ''} />
                                        <span>Test Connection</span>
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    className="w-full bg-bg-base border border-border rounded-xl p-3 text-sm text-text-main outline-none focus:border-primary transition-all font-mono"
                                    placeholder="http://localhost:11434"
                                    value={baseUrls.ollama || ''}
                                    onChange={(e) => setBaseUrls({ ...baseUrls, ollama: e.target.value })}
                                />
                                {ollamaStatus.checked && (
                                    <div className={`flex items-center gap-1.5 text-xs font-medium ${
                                        ollamaStatus.ok ? 'text-emerald-400' : 'text-red-400'
                                    }`}>
                                        {ollamaStatus.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                                        <span>{ollamaStatus.message}</span>
                                    </div>
                                )}

                                {/* Step-by-Step Setup Guide Accordion */}
                                <div className="rounded-xl border border-border/70 bg-bg-surface overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setShowOllamaGuide(!showOllamaGuide)}
                                        className="w-full flex items-center justify-between p-3 text-xs font-bold text-text-main hover:bg-white/5 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-2 text-primary">
                                            <BookOpen size={14} />
                                            <span>Quick Setup Guide: How to Connect Ollama (60s)</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[11px] text-text-muted">
                                            <span>{showOllamaGuide ? 'Hide' : 'Show Instructions'}</span>
                                            <ChevronDown size={14} className={`transform transition-transform ${showOllamaGuide ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>

                                    {showOllamaGuide && (
                                        <div className="p-4 pt-1 space-y-3.5 border-t border-border/50 text-xs text-text-muted bg-black/20">
                                            <div>
                                                <p className="font-semibold text-text-main mb-1">1. Install Ollama</p>
                                                <p>Download and install Ollama from <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">ollama.com <ExternalLink size={10} /></a>.</p>
                                            </div>

                                            <div>
                                                <p className="font-semibold text-text-main mb-1">2. Enable Browser CORS (Crucial)</p>
                                                <p className="mb-1.5">Because PrivAI calls Ollama directly from your browser, Ollama requires permission to accept browser requests:</p>
                                                <div className="space-y-2 font-mono text-[11px] bg-bg-base p-2.5 rounded-lg border border-border">
                                                    <div>
                                                        <span className="text-text-faint font-sans text-[10px] block">macOS / Linux Terminal:</span>
                                                        <code className="text-emerald-400">OLLAMA_ORIGINS=&quot;*&quot; ollama serve</code>
                                                    </div>
                                                    <div>
                                                        <span className="text-text-faint font-sans text-[10px] block">Windows PowerShell:</span>
                                                        <code className="text-emerald-400">$env:OLLAMA_ORIGINS=&quot;*&quot;; ollama serve</code>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <p className="font-semibold text-text-main mb-1">3. Download a Model</p>
                                                <div className="font-mono text-[11px] bg-bg-base p-2.5 rounded-lg border border-border">
                                                    <code className="text-emerald-400">ollama run llama3.2</code>
                                                    <span className="text-text-faint font-sans text-[10px] block mt-1">Or run DeepSeek R1: <code className="text-emerald-400 font-mono">ollama run deepseek-r1:8b</code></span>
                                                </div>
                                            </div>

                                            <div>
                                                <p className="font-semibold text-text-main mb-1">4. Verify in PrivAI</p>
                                                <p>Click the <strong className="text-primary">&quot;Test Connection&quot;</strong> button above. PrivAI will ping localhost:11434 and automatically discover your installed models in the Model Selector!</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* LM Studio Host */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-text-main">LM Studio / LocalAI Base URL</label>
                                <input
                                    type="text"
                                    className="w-full bg-bg-base border border-border rounded-xl p-3 text-sm text-text-main outline-none focus:border-primary transition-all font-mono"
                                    placeholder="http://localhost:1234/v1"
                                    value={baseUrls.lmstudio || ''}
                                    onChange={(e) => setBaseUrls({ ...baseUrls, lmstudio: e.target.value })}
                                />
                                <span className="text-[11px] text-text-faint block">
                                    Supports LM Studio, LocalAI, vLLM, or any OpenAI-compatible server.
                                </span>
                            </div>

                            {/* Custom OpenAI Proxy / OpenRouter */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-text-main">Custom OpenAI Base URL (Optional)</label>
                                <input
                                    type="text"
                                    className="w-full bg-bg-base border border-border rounded-xl p-3 text-sm text-text-main outline-none focus:border-primary transition-all font-mono"
                                    placeholder="https://openrouter.ai/api/v1 or custom proxy"
                                    value={baseUrls.openai || ''}
                                    onChange={(e) => setBaseUrls({ ...baseUrls, openai: e.target.value })}
                                />
                                <span className="text-[11px] text-text-faint block">
                                    Override endpoint for OpenRouter, Cloudflare AI Gateway, or self-hosted proxy.
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Tab: Cloud API Keys */}
                    {activeTab === 'cloud' && (
                        <div className="space-y-4">
                            <p className="text-xs text-text-muted">
                                PrivAI communicates directly from your browser to each AI provider using client-side BYOK. Keys are encrypted in your local device storage.
                            </p>
                            {cloudProviders.map(p => (
                                <div key={p.id} className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-semibold text-text-main">{p.name}</label>
                                        <span className="text-[10px] text-text-faint">{p.desc}</span>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showKey[p.id] ? "text" : "password"}
                                            className="w-full bg-bg-base border border-border rounded-xl p-3 text-sm text-text-main outline-none focus:border-primary transition-all font-mono"
                                            placeholder={`Paste ${p.name} Key...`}
                                            value={keys[p.id] || ''}
                                            onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => toggleShow(p.id)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-1 rounded-lg"
                                        >
                                            {showKey[p.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Tab: Security & Encrypted Backups */}
                    {activeTab === 'security' && (
                        <div className="space-y-6">
                            <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 leading-relaxed">
                                <div className="flex items-center gap-1.5 font-bold mb-1">
                                    <Shield size={14} className="text-purple-400" />
                                    <span>Client-Side AES-256-GCM Zero-Knowledge Encryption</span>
                                </div>
                                Export all conversations and configurations into a portable encrypted <code className="bg-purple-900/50 px-1 py-0.5 rounded">.privai</code> file. Zero servers involved.
                            </div>

                            {/* Status Alert */}
                            {backupStatus && (
                                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                                    backupStatus.ok
                                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                        : 'bg-red-500/10 border border-red-500/20 text-red-400'
                                }`}>
                                    {backupStatus.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                                    <span>{backupStatus.message}</span>
                                </div>
                            )}

                            {/* Export Section */}
                            <div className="space-y-3 p-4 rounded-xl bg-bg-base border border-border">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-text-main flex items-center gap-1.5">
                                    <Download size={14} className="text-primary" />
                                    <span>Export Encrypted Backup (.privai)</span>
                                </h4>
                                <input
                                    type="password"
                                    placeholder="Enter Master Encryption Passphrase..."
                                    value={exportPassphrase}
                                    onChange={(e) => setExportPassphrase(e.target.value)}
                                    className="w-full bg-bg-surface border border-border rounded-xl p-2.5 text-xs text-text-main outline-none focus:border-primary"
                                />
                                <button
                                    type="button"
                                    onClick={handleExportBackup}
                                    disabled={isProcessingBackup}
                                    className="w-full flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-hover text-white py-2 rounded-xl text-xs font-bold transition-all"
                                >
                                    <Download size={13} />
                                    <span>{isProcessingBackup ? 'Encrypting...' : 'Export .privai File'}</span>
                                </button>
                            </div>

                            {/* Restore Section */}
                            <div className="space-y-3 p-4 rounded-xl bg-bg-base border border-border">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-text-main flex items-center gap-1.5">
                                    <Upload size={14} className="text-emerald-400" />
                                    <span>Restore from Encrypted Backup</span>
                                </h4>
                                <input
                                    type="file"
                                    accept=".privai,.json"
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            setImportFile(e.target.files[0]);
                                        }
                                    }}
                                    className="w-full text-xs text-text-muted file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-text-main hover:file:bg-white/20"
                                />
                                <input
                                    type="password"
                                    placeholder="Enter Passphrase to Decrypt..."
                                    value={importPassphrase}
                                    onChange={(e) => setImportPassphrase(e.target.value)}
                                    className="w-full bg-bg-surface border border-border rounded-xl p-2.5 text-xs text-text-main outline-none focus:border-primary"
                                />
                                <button
                                    type="button"
                                    onClick={handleImportBackup}
                                    disabled={isProcessingBackup}
                                    className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-xs font-bold transition-all"
                                >
                                    <Upload size={13} />
                                    <span>{isProcessingBackup ? 'Decrypting...' : 'Decrypt & Restore Data'}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Tab: Appearance */}
                    {activeTab === 'appearance' && (
                        <div className="space-y-6">
                            {/* Theme */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-text-main">Interface Theme</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {(['light', 'dark', 'oled', 'system'] as const).map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => dispatch({ type: 'SET_THEME', theme: t })}
                                            className={`
                                                px-2 py-2.5 rounded-xl text-xs font-bold border transition-all capitalize
                                                ${state.theme === t
                                                    ? 'bg-primary text-white border-primary shadow-glow'
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
                                <label className="text-sm font-semibold text-text-main flex justify-between">
                                    <span>Typography Scale</span>
                                    <span className="text-primary text-[10px] font-black uppercase tracking-widest">{state.textSize}</span>
                                </label>
                                <div className="flex bg-bg-base border border-border rounded-xl p-1.5">
                                    {(['small', 'medium', 'large', 'xlarge'] as const).map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => dispatch({ type: 'SET_TEXT_SIZE', size: s })}
                                            className={`
                                                flex-1 py-2 rounded-lg text-xs font-bold transition-all
                                                ${state.textSize === s
                                                    ? 'bg-bg-highlight text-text-main shadow-md'
                                                    : 'text-text-muted hover:text-text-main'}
                                            `}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <footer className="p-4 border-t border-border bg-bg-surface flex items-center justify-end gap-2.5">
                    <button
                        type="button"
                        onClick={() => dispatch({ type: 'TOGGLE_SETTINGS', open: false })}
                        className="px-4 py-2.5 rounded-xl text-xs font-semibold text-text-muted hover:text-text-main hover:bg-bg-highlight/50 transition-colors border border-border"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 bg-gradient-primary text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md hover:shadow-glow transition-all active:scale-[0.98]"
                    >
                        <Save size={14} />
                        <span>Save Settings</span>
                    </button>
                </footer>
            </div>
        </div>
    );
};
