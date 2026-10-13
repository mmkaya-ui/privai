"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { ChevronDown, Sparkles, Zap, Check, Cpu } from 'lucide-react';
import { AVAILABLE_MODELS, AIModelDefinition, createModelConfig, getAvailableModels } from '@/services/models';

export const ModelSelector = () => {
    const { state, dispatch } = useApp();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const availableModels = getAvailableModels(state.apiKeys);
    const currentModel = AVAILABLE_MODELS.find(m => m.id === state.defaultModelConfig.modelId);
    const isCurrentLocal = currentModel?.isLocal;

    // Group models
    const webllmModels = availableModels.filter(m => m.providerId === 'webllm');
    const localHostModels = availableModels.filter(m => m.isLocal && m.providerId !== 'webllm');
    const freeModels = availableModels.filter(m => m.isFree && !m.isLocal);
    const paidModels = availableModels.filter(m => !m.isFree);

    const handleSelectModel = (model: AIModelDefinition) => {
        dispatch({
            type: 'SET_MODEL',
            config: createModelConfig(model, state.defaultModelConfig.temperature, state.customBaseUrls[model.providerId])
        });
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all duration-200 text-left group"
            >
                <div className="flex flex-col">
                    <span className={`text-[10px] font-bold uppercase tracking-wider leading-none mb-0.5 ${
                        isCurrentLocal ? 'text-emerald-400' : 'text-accent-yellow'
                    }`}>
                        {isCurrentLocal ? 'LOCAL RUNTIME' : 'COMPUTE CORE'}
                    </span>
                    <div className="flex items-center gap-1.5">
                        {isCurrentLocal ? (
                            <Cpu size={13} className="text-emerald-400" />
                        ) : (
                            <Sparkles size={13} className="text-accent-yellow" />
                        )}
                        <span className="font-semibold text-sm text-white/90 group-hover:text-white transition-colors">
                            {currentModel?.name || state.defaultModelConfig.modelId}
                        </span>
                    </div>
                </div>
                <ChevronDown size={14} className={`text-text-muted transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-84 max-w-[90vw] bg-bg-surface border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                    <div className="max-h-[460px] overflow-y-auto custom-scrollbar p-2 space-y-3">
                        {/* WebGPU In-Browser */}
                        {webllmModels.length > 0 && (
                            <div className="space-y-1">
                                <div className="px-3 py-1.5 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <Zap size={14} className="text-purple-400" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400">
                                            In-Browser WebGPU
                                        </span>
                                    </div>
                                    <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full uppercase border border-purple-500/20">
                                        0 Install
                                    </span>
                                </div>
                                {webllmModels.map(model => (
                                    <ModelOption
                                        key={model.id}
                                        model={model}
                                        isSelected={state.defaultModelConfig.modelId === model.id}
                                        onSelect={() => handleSelectModel(model)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Local Models Section (Ollama / LM Studio) */}
                        {localHostModels.length > 0 && (
                            <div className="space-y-1 border-t border-border/50 pt-2">
                                <div className="px-3 py-1.5 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <Cpu size={14} className="text-emerald-400" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
                                            Local Machine (Ollama)
                                        </span>
                                    </div>
                                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase border border-emerald-500/20">
                                        Air-Gapped
                                    </span>
                                </div>
                                {localHostModels.map(model => (
                                    <ModelOption
                                        key={model.id}
                                        model={model}
                                        isSelected={state.defaultModelConfig.modelId === model.id}
                                        onSelect={() => handleSelectModel(model)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Free Cloud Tier (Groq) */}
                        {freeModels.length > 0 && (
                            <div className="space-y-1 border-t border-border/50 pt-2">
                                <div className="px-3 py-1.5 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <Sparkles size={14} className="text-accent-green" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-green">
                                            Standard Tier (Groq)
                                        </span>
                                    </div>
                                    <span className="text-[9px] font-bold text-accent-green/80 bg-accent-green/10 px-1.5 py-0.5 rounded-full uppercase">
                                        Fast LPU
                                    </span>
                                </div>
                                {freeModels.map(model => (
                                    <ModelOption
                                        key={model.id}
                                        model={model}
                                        isSelected={state.defaultModelConfig.modelId === model.id}
                                        onSelect={() => handleSelectModel(model)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Paid Models Section */}
                        {paidModels.length > 0 && (
                            <div className="space-y-1 border-t border-border/50 pt-2">
                                <div className="px-3 py-1.5 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <Zap size={14} className="text-accent-yellow" />
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-yellow">
                                            Elite Tier (BYOK)
                                        </span>
                                    </div>
                                    <span className="text-[9px] font-bold text-accent-yellow/80 bg-accent-yellow/10 px-1.5 py-0.5 rounded-full uppercase">
                                        Direct API
                                    </span>
                                </div>
                                {paidModels.map(model => (
                                    <ModelOption
                                        key={model.id}
                                        model={model}
                                        isSelected={state.defaultModelConfig.modelId === model.id}
                                        onSelect={() => handleSelectModel(model)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

interface ModelOptionProps {
    model: AIModelDefinition;
    isSelected: boolean;
    onSelect: () => void;
}

const ModelOption = ({ model, isSelected, onSelect }: ModelOptionProps) => {
    return (
        <button
            onClick={onSelect}
            className={`
                w-full px-3 py-2.5 flex items-center justify-between rounded-xl transition-all duration-200 group text-left
                ${isSelected
                    ? 'bg-primary text-white shadow-md'
                    : 'text-text-main hover:bg-white/5'}
            `}
        >
            <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                <span className="text-sm font-bold truncate">
                    {model.name}
                </span>
                <span className={`text-[10px] font-medium leading-tight truncate ${
                    isSelected ? 'text-white/80' : 'text-text-faint group-hover:text-text-muted'
                }`}>
                    {model.description || (model.contextWindow ? `${(model.contextWindow / 1000).toFixed(0)}k Context` : 'Standard Context')}
                </span>
            </div>
            {isSelected ? (
                <div className="bg-white/20 p-1 rounded-lg shrink-0">
                    <Check size={14} className="text-white" />
                </div>
            ) : null}
        </button>
    );
};
