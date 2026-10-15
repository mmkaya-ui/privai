import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** `npm run build && npm run screenshots` regenerates docs/screenshots/*.png (provider replies are mocked). */
export default defineConfig({
    ...base,
    testDir: "scripts/screenshots",
    use: { ...base.use, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: "dark" },
});
