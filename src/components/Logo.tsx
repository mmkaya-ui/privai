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
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
            </defs>
            <path
                d="M16 2C11 2 6 5 4 10C4 15 6 22 16 28C26 22 28 15 28 10C26 5 21 2 16 2Z"
                stroke="url(#logo_grad)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M16 8C14.5 8 13.5 9 13.5 10.5C13.5 12 14.5 13 16 13C17.5 13 18.5 12 18.5 10.5C18.5 9 17.5 8 16 8Z"
                fill="url(#logo_grad)"
            />
            <path
                d="M16 13V18"
                stroke="url(#logo_grad)"
                strokeWidth="2"
                strokeLinecap="round"
            />
            <circle cx="12" cy="20" r="1.5" fill="var(--color-text-main)" />
            <circle cx="16" cy="21" r="1.5" fill="var(--color-text-main)" />
            <circle cx="20" cy="20" r="1.5" fill="var(--color-text-main)" />
        </svg>
    );
};
