"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { ChevronDown, Sparkles, Zap, Check } from 'lucide-react';
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

    // Group models by free/paid
    const freeModels = availableModels.filter(m => m.isFree);
    const paidModels = availableModels.filter(m => !m.isFree);

    const handleSelectModel = (model: AIModelDefinition) => {
        dispatch({
            type: 'SET_MODEL',
            config: createModelConfig(model, state.defaultModelConfig.temperature)
        });
        setIsOpen(false);
    };

    // Check if no models available (no API keys)
    const noModelsAvailable = availableModels.length === 0;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 p-2 rounded-xl hover:bg-bg-highlight/50 transition-all duration-200 text-left border border-transparent hover:border-border"
            >
                <div className="flex flex-col">
                    <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em] leading-none mb-1">Compute Core</span>
                    <div className="flex items-center gap-1.5">
                        {currentModel?.isFree ? <Sparkles size={12} className="text-accent-green" /> : <Zap size={12} className="text-accent-yellow" />}
                        <span className="font-bold text-sm sm:text-base text-text-main">
                            {currentModel?.name || state.defaultModelConfig.modelId}
                        </span>
                    </div>
                </div>
                <ChevronDown size={16} className={`text-text-faint transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-3 w-80 bg-glass border border-border rounded-2xl shadow-xl z-50 overflow-hidden animate-fade-in ring-1 ring-black/20">
                    {noModelsAvailable ? (
                        <div className="p-6 text-center">
                            <p className="text-sm text-text-muted mb-4 font-medium">No Neural Engines Connected</p>
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    dispatch({ type: 'TOGGLE_SETTINGS' });
                                }}
                                className="w-full bg-gradient-primary text-white py-2.5 rounded-xl text-xs font-bold shadow-md hover:shadow-glow transition-all active:scale-95"
                            >
                                Connect APIs in Settings
                            </button>
                        </div>
                    ) : (
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-1.5 space-y-1">
                            {/* Free Models Section */}
                            {freeModels.length > 0 && (
                                <div className="space-y-1 pb-2">
                                    <div className="px-3 py-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Sparkles size={14} className="text-accent-green" />
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-green">Standard Tier</span>
                                        </div>
                                        <span className="text-[9px] font-bold text-accent-green/60 bg-accent-green/10 px-1.5 py-0.5 rounded-full uppercase">High Vol</span>
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
                                <div className="space-y-1">
                                    <div className="px-3 py-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Zap size={14} className="text-accent-yellow" />
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-yellow">Elite Tier</span>
                                        </div>
                                        <span className="text-[9px] font-bold text-accent-yellow/60 bg-accent-yellow/10 px-1.5 py-0.5 rounded-full uppercase">Premium</span>
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
                    )}
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
                w-full px-3 py-3 flex items-center justify-between rounded-xl transition-all duration-200 group
                ${isSelected
                    ? 'bg-gradient-primary text-white shadow-md'
                    : 'text-text-main hover:bg-white/10'}
            `}
        >
            <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold">
                    {model.name}
                </span>
                <span className={`text-[10px] font-medium leading-tight ${isSelected ? 'text-white/80' : 'text-text-faint group-hover:text-text-muted'}`}>
                    {model.description || (model.contextWindow ? `${(model.contextWindow / 1000).toFixed(0)}k Context` : 'Standard Context')}
                </span>
            </div>
            {isSelected ? (
                <div className="bg-white/20 p-1 rounded-lg">
                    <Check size={14} className="text-white" />
                </div>
            ) : (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronDown size={14} className="-rotate-90 text-text-faint" />
                </div>
            )}
        </button>
    );
};
