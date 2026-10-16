// Runs the existing browser and booking suites against the Cloudflare Workers
// build, served locally by workerd (`wrangler dev` on dist/), with a local D1
// database created from drizzle/. Third-party services (Turnstile, email,
// Google Calendar) are the same loopback fakes the Vercel e2e suite uses.
//   npm run test:cloudflare            (builds first; both suites)
//   CF_SUITE=browser|e2e npx playwright test -c playwright.cloudflare.config.mjs
import { defineConfig, devices } from "@playwright/test";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const suite = process.env.CF_SUITE === "browser" ? "browser" : "e2e";
const port = suite === "browser" ? 4190 : 4188;
const fakes = 4186;
const state = `.wrangler/test-state-${suite}`;
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
const secret = () => randomBytes(32).toString("hex");
const google = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const busyDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(Date.now() + 2 * 86400000));
const busy = [{ start: `${busyDay}T05:00:00Z`, end: `${busyDay}T23:59:00Z` }];

// Worker variables for this run. Written only by the main Playwright process (test
// workers re-evaluate this file) to the git-ignored build output.
const vars = suite === "browser"
  ? { BOOKING_ENABLED: "false", BOOKING_ORIGIN: `http://127.0.0.1:${port}` }
  : {
    TEST_PROVIDER_ORIGIN: `http://127.0.0.1:${fakes}`, BOOKING_ENABLED: "true", BOOKING_SCHEDULER_READY: "true",
    BOOKING_ORIGIN: `http://127.0.0.1:${port}`, TURNSTILE_SITE_KEY: "test-site-key", TURNSTILE_SECRET_KEY: "test", RESEND_API_KEY: "test",
    BOOKING_FROM_EMAIL: "Camotive <bookings@example.com>", CAM_BOOKING_EMAIL: "cam@example.com",
    BOOKING_ENCRYPTION_KEY: secret(), BOOKING_HASH_SECRET: secret(), BOOKING_CRON_SECRET: secret(),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "camotive@test.iam.gserviceaccount.com", GOOGLE_SERVICE_ACCOUNT_KEY: google.privateKey, GOOGLE_CALENDAR_ID: "cam@example.com",
  };
if (!process.env.TEST_WORKER_INDEX) {
  writeFileSync("dist/server/.dev.vars", Object.entries(vars).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("\n") + "\n");
}

const wrangler = "node node_modules/wrangler/bin/wrangler.js";
const migrate = `for f in drizzle/*.sql; do ${wrangler} d1 execute DB --local -c dist/server/wrangler.json --persist-to ${state} --file "$f" >/dev/null || exit 1; done`;

export default defineConfig({
  testDir: suite === "browser" ? "tests/browser" : "tests/e2e",
  timeout: 60000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://127.0.0.1:${port}`, launchOptions },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
    { name: "phone", use: { ...devices["Pixel 7"], launchOptions } },
  ],
  webServer: [
    ...(suite === "e2e" ? [{ command: "node tests/e2e/fake-providers.mjs", url: `http://127.0.0.1:${fakes}/__health`, reuseExistingServer: false,
      env: { FAKE_PROVIDER_PORT: String(fakes), FAKE_GOOGLE_PUBLIC_KEY: google.publicKey, FAKE_GOOGLE_BUSY: JSON.stringify(busy) } }] : []),
    {
      command: `sh -c 'rm -rf ${state} && ${migrate} && exec ${wrangler} dev -c dist/server/wrangler.json --local --ip 127.0.0.1 --port ${port} --persist-to ${state} --show-interactive-dev-session=false'`,
      url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 120000,
      env: { WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: ".wrangler/logs" },
    },
  ],
});
