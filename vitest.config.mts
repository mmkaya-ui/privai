import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    resolve: {
        alias: { "@": path.resolve(__dirname, "src") },
    },
    esbuild: { jsx: "automatic" },
    test: {
        environment: "node",
        include: ["src/**/*.test.{ts,tsx}"],
        restoreMocks: true,
        unstubEnvs: true,
        unstubGlobals: true,
        coverage: {
            provider: "v8",
            // Scope: the logic layer. React UI (except ErrorBoundary), the store and IndexedDB storage
            // are exercised by the Playwright suite in e2e/ instead and are not counted here.
            include: ["src/services/**", "src/lib/proxy-guard.ts", "src/lib/persistence.ts", "src/app/api/**", "src/components/ErrorBoundary.tsx"],
            exclude: ["src/services/__tests__/**", "src/**/*.test.{ts,tsx}"],
            reporter: ["text-summary", "lcov"],
            // Enforced: `npm run test:coverage` exits non-zero below these.
            thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
        },
    },
});
