"use client";

import { useEffect, useCallback } from 'react';
import { useApp } from '@/lib/store';

export const useMobileNavigation = () => {
    const { state, dispatch } = useApp();

    // 1. Handle Navigation State via History API
    // We Map:
    // Root -> Sidebar Open, No Settings, No Chat (Mobile)
    // #chat -> Sidebar Closed, Chat Open
    // #settings -> Settings Open

    // Initialize/Sync on mount
    useEffect(() => {
        // Initial state logic specific to mobile could go here, 
        // but for now we just react to state changes.
    }, []);

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
        const handlePopState = (event: PopStateEvent) => {
            // If we popped to nothing (Root)
            const hash = window.location.hash;

            if (state.isSettingsOpen && hash !== '#settings') {
                dispatch({ type: 'TOGGLE_SETTINGS' }); // Close Settings
                return;
            }

            // Mobile: If we went back from Chat -> List
            const isMobile = window.innerWidth < 640;
            if (isMobile && !state.isSidebarOpen && hash !== '#chat') {
                // We want to show sidebar, clear current session? 
                // Or just show sidebar overlay?
                // "One previous menu" -> Sidebar
                dispatch({ type: 'TOGGLE_SIDEBAR' }); // Show sidebar
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [state.isSettingsOpen, state.isSidebarOpen, dispatch]);

    // 2. Prevent Exit (Double Press Back)
    // This is hard to do perfectly in Browser. 
    // Workaround: Ensure we always have a 'root' state pushed.
    useEffect(() => {
        // Push a dummy state on mount so 'Back' doesn't exit immediately?
        // window.history.pushState({ view: 'root' }, '', '');
        // This is annoying for user navigation flow if they *want* to leave.
        // Better: Use `confirm` on `beforeunload`?

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // If we are active in a chat or have unsaved work?
            // Browsers override custom messages now.
            e.preventDefault();
            e.returnValue = ''; // Trigger standard browser prompt
        };

        // Only warn if generating?
        // window.addEventListener('beforeunload', handleBeforeUnload);
        // return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    // 3. Wake Lock (Background-ish Support)
    useEffect(() => {
        let wakeLock: any = null;

        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    wakeLock = await (navigator as any).wakeLock.request('screen');
                } catch (err) {
                    console.log('Wake Lock denied:', err);
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
