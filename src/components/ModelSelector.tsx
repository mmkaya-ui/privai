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
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-bg-surface-hover transition-colors text-left"
            >
                <div className="flex flex-col">
                    <span className="text-xs text-text-muted font-mono uppercase">Model</span>
                    <div className="flex items-center gap-1.5">
                        {currentModel?.isFree && <Sparkles size={12} className="text-green-400" />}
                        <span className="font-bold text-sm sm:text-base">
                            {currentModel?.name || state.defaultModelConfig.modelId}
                        </span>
                    </div>
                </div>
                <ChevronDown size={16} className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-bg-surface border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                    {noModelsAvailable ? (
                        <div className="p-4 text-center text-text-muted">
                            <p className="text-sm mb-2">No API keys configured</p>
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    dispatch({ type: 'TOGGLE_SETTINGS' });
                                }}
                                className="text-primary text-sm font-medium hover:underline"
                            >
                                Add API Keys in Settings
                            </button>
                        </div>
                    ) : (
                        <div className="max-h-80 overflow-y-auto custom-scrollbar">
                            {/* Free Models Section */}
                            {freeModels.length > 0 && (
                                <div>
                                    <div className="px-3 py-2 bg-bg-highlight flex items-center gap-2">
                                        <Sparkles size={14} className="text-green-400" />
                                        <span className="text-xs font-bold uppercase tracking-wider text-green-400">Free Models</span>
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
                                <div>
                                    <div className="px-3 py-2 bg-bg-highlight flex items-center gap-2">
                                        <Zap size={14} className="text-yellow-400" />
                                        <span className="text-xs font-bold uppercase tracking-wider text-yellow-400">Paid Models</span>
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
            className={`w-full px-3 py-2.5 flex items-center justify-between hover:bg-bg-surface-hover transition-colors text-left ${isSelected ? 'bg-bg-highlight' : ''}`}
        >
            <div className="flex flex-col">
                <span className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-text-main'}`}>
                    {model.name}
                </span>
                {model.description && (
                    <span className="text-xs text-text-muted">{model.description}</span>
                )}
            </div>
            {isSelected && <Check size={16} className="text-primary shrink-0" />}
        </button>
    );
};
