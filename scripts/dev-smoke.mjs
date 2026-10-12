// Starts `next dev` (Turbopack, what developers run locally) and requests every
// page and icon. Turbopack is stricter than the production webpack build about
// some assets (e.g. it rejects favicon.ico frames without an alpha channel), so
// this catches problems the build and production tests can't see.
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 4200;
const origin = `http://127.0.0.1:${port}`;
const paths = ["/", "/favicon.ico", "/icon.png", "/apple-icon.png", "/mobile-detailing", "/ceramic-coating", "/paint-correction",
  "/locations", "/stone-oak", "/our-work", "/reviews", "/contact", "/book", "/appointment"];

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, BOOKING_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", chunk => { logs += chunk; });
server.stderr.on("data", chunk => { logs += chunk; });

let failed = false;
try {
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    // Any HTTP response means the server is up; page status is checked below.
    try { await fetch(origin + "/robots-probe", { signal: AbortSignal.timeout(30000) }); ready = true; } catch { await delay(500); }
  }
  if (!ready) throw new Error("dev server did not start");
  for (const path of paths) {
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(60000) });
    const ok = response.status === 200;
    console.log(`${ok ? "ok  " : "FAIL"} ${response.status} ${path}`);
    if (!ok) failed = true;
  }
  if (/Build Error|Processing image failed|Module not found/i.test(logs)) { failed = true; console.error(logs); }
} catch (error) {
  failed = true;
  console.error(String(error), logs);
} finally {
  server.kill("SIGTERM");
}
process.exitCode = failed ? 1 : 0;
