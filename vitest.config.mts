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
            include: ["src/services/**", "src/lib/proxy-guard.ts", "src/app/api/**", "src/components/ErrorBoundary.tsx"],
            reporter: ["text-summary", "lcov"],
        },
    },
});
