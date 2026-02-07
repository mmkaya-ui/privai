import React from 'react';

export const Logo = ({ size = 32, className = "" }: { size?: number, className?: string }) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <defs>
                <linearGradient id="logo_grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#667eea" />
                    <stop offset="100%" stopColor="#764ba2" />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            <rect x="4" y="4" width="24" height="24" rx="6" stroke="url(#logo_grad)" strokeWidth="2" filter="url(#glow)" />
            <path
                d="M16 8L22 16L16 24L10 16L16 8Z"
                fill="url(#logo_grad)"
                fillOpacity="0.8"
            />
            <circle cx="16" cy="16" r="3" fill="white" filter="url(#glow)" />
        </svg>
    );
};
