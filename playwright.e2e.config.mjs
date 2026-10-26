// End-to-end booking test: the production build runs fully configured, but every
// third-party service (D1, Turnstile, Resend, Google Calendar) is a local fake on loopback.
// Run with: npm run test:e2e  (builds first).
import { defineConfig, devices } from "@playwright/test";
import { generateKeyPairSync, randomBytes } from "node:crypto";

const port = 4187;
const fakes = 4186;
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
const stripeWebhookSecret = `whsec_${randomBytes(16).toString("hex")}`;
const secret = () => randomBytes(32).toString("hex");
// A throwaway service-account key: the app signs with the private half, the fake
// Google checks the signature with the public half.
const google = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
// Cam is already busy all day the day after tomorrow (Chicago), so every slot must show as taken.
const busyDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(Date.now() + 2 * 86400000));
const busy = [{ start: `${busyDay}T05:00:00Z`, end: new Date(Date.parse(`${busyDay}T23:59:00Z`) + 4 * 3600000).toISOString() }];

export default defineConfig({
  testDir: "tests/e2e",
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
    { command: "node tests/e2e/fake-providers.mjs", url: `http://127.0.0.1:${fakes}/__health`, reuseExistingServer: false,
      env: { FAKE_PROVIDER_PORT: String(fakes), FAKE_STRIPE_WEBHOOK_URL: `http://127.0.0.1:${port}/api/stripe/webhook`, FAKE_STRIPE_WEBHOOK_SECRET: stripeWebhookSecret, FAKE_GOOGLE_PUBLIC_KEY: google.publicKey, FAKE_GOOGLE_BUSY: JSON.stringify(busy) } },
    {
      command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 60000,
      env: {
        TEST_PROVIDER_ORIGIN: `http://127.0.0.1:${fakes}`, VERCEL: "", BOOKING_ENABLED: "true", BOOKING_SCHEDULER_READY: "true",
        BOOKING_ORIGIN: `http://127.0.0.1:${port}`, CLOUDFLARE_ACCOUNT_ID: "test", CLOUDFLARE_D1_DATABASE_ID: "test", CLOUDFLARE_D1_API_TOKEN: "test",
        TURNSTILE_SITE_KEY: "test-site-key", TURNSTILE_SECRET_KEY: "test", RESEND_API_KEY: "test",
        BOOKING_FROM_EMAIL: "Camotive <bookings@example.com>", CAM_BOOKING_EMAIL: "cam@example.com",
        BOOKING_ENCRYPTION_KEY: secret(), BOOKING_HASH_SECRET: secret(), BOOKING_CRON_SECRET: secret(),
        // Stored the way Vercel often keeps it: one line with literal "\n".
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "camotive@test.iam.gserviceaccount.com", GOOGLE_SERVICE_ACCOUNT_KEY: google.privateKey.replace(/\n/g, "\\n"),
        GOOGLE_CALENDAR_ID: "cam@example.com",
        STRIPE_SECRET_KEY: "sk_test_fakeprovider000", STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
      },
    },
  ],
});
