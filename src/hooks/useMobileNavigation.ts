"use client";

import { useEffect } from 'react';
import { useApp } from '@/lib/store';

export const useMobileNavigation = () => {
    const { state, dispatch } = useApp();

    // 1. Handle Navigation State via History API
    // We Map:
    // Root -> Sidebar Open, No Settings, No Chat (Mobile)
    // #chat -> Sidebar Closed, Chat Open
    // #settings -> Settings Open

    // Sync State -> URL Hash
    useEffect(() => {
        const isMobile = window.innerWidth < 640;

        // 1. Settings Open
        if (state.isSettingsOpen) {
            if (window.location.hash !== '#settings') {
                window.history.pushState({ view: 'settings' }, '', '#settings');
            }
        }
        // 2. Chat Open (Mobile)
        // condition: Has ID, Sidebar is CLOSED (implies Detail View)
        else if (isMobile && state.currentSessionId && !state.isSidebarOpen) {
            if (window.location.hash !== '#chat') {
                window.history.pushState({ view: 'chat' }, '', '#chat');
            }
        }
        // 3. Root (Sidebar Open or Desktop)
        else {
            if (window.location.hash === '#settings' || (window.location.hash === '#chat' && isMobile)) {
                // Clean URL without navigating
                window.history.replaceState(null, '', ' ');
            }
        }
    }, [state.isSettingsOpen, state.currentSessionId, state.isSidebarOpen]);

    // Handle Back Button (PopState)
    useEffect(() => {
        const handlePopState = () => {
            // If we popped to nothing (Root)
            const hash = window.location.hash;

            if (state.isSettingsOpen && hash !== '#settings') {
                dispatch({ type: 'TOGGLE_SETTINGS' }); // Close Settings
                return;
            }

            // Mobile: If we went back from Chat -> List
            const isMobile = window.innerWidth < 640;
            if (isMobile && !state.isSidebarOpen && hash !== '#chat') {
                dispatch({ type: 'TOGGLE_SIDEBAR' }); // Show sidebar
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [state.isSettingsOpen, state.isSidebarOpen, dispatch]);

    // 2. Wake Lock (Background-ish Support)
    useEffect(() => {
        let wakeLock: WakeLockSentinel | null = null;

        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    const nav = navigator as unknown as { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } };
                    wakeLock = await nav.wakeLock.request('screen');
                } catch {
                    // Ignore wake lock denials
                }
            }
        };

        requestWakeLock();

        const handleVisibilityChange = () => {
            if (wakeLock !== null && document.visibilityState === 'visible') {
                requestWakeLock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            if (wakeLock) wakeLock.release();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);
};
