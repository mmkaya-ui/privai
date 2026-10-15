import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests drive the real production build (`next build` + `next start`) in Chromium.
 * Provider APIs are intercepted with `page.route`, so no API keys or network access are needed
 * and every assertion is about what the app actually sends / stores.
 *
 *   npm run build && npm run test:e2e
 *
 * Set PW_CHROMIUM_PATH to use a pre-installed Chromium instead of `npx playwright install chromium`.
 */
const PORT = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
    testDir: "e2e",
    timeout: 60_000,
    fullyParallel: false,
    workers: 1,
    reporter: [["list"]],
    use: {
        baseURL: `http://localhost:${PORT}`,
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
    },
    webServer: {
        command: `npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 60_000,
    },
});
