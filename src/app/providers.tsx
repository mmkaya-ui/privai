"use client";

import { AppProvider } from "@/lib/store";
import { useMobileNavigation } from "@/hooks/useMobileNavigation";

function NavigationManager() {
    useMobileNavigation();
    return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <AppProvider>
            <NavigationManager />
            {children}
        </AppProvider>
    );
}
