// Browser checks against the production Next.js build (what Vercel runs).
// Run with: npm run test:browser  (builds first). CI installs Chromium itself;
// set PW_CHROMIUM_PATH to use an already-installed browser locally.
import { defineConfig, devices } from "@playwright/test";

const port = 4180;
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: "tests/browser",
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://127.0.0.1:${port}`, launchOptions },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "phone", use: { ...devices["Pixel 7"], launchOptions } },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60000,
    // Booking must render its safe "call or text" fallback with no configuration.
    env: { BOOKING_ENABLED: "false", CLOUDFLARE_D1_API_TOKEN: "" },
  },
});
