import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { before, after, test } from "node:test";

const origin = "http://127.0.0.1:4179";
let server;
let logs = "";

before(async () => {
  // Cloudflare modules require workerd rather than Node's ESM loader.
  server = spawn(process.execPath, [
    "node_modules/wrangler/bin/wrangler.js", "dev",
    "--config", "dist/server/wrangler.json", "--local",
    "--ip", "127.0.0.1", "--port", "4179", "--inspector-port", "0",
  ], { env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", chunk => { logs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; });
  server.on("error", error => { logs += error.message; });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview exited: ${logs}`);
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch { /* Wait for runtime startup. */ }
    await delay(250);
  }
  throw new Error(`Preview did not become ready: ${logs}`);
}, { timeout: 180000 });

after(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise(resolve => server.once("exit", resolve));
  server.kill("SIGTERM");
  const fallback = setTimeout(() => server.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(fallback);
});

async function html(path) {
  const response = await fetch(`${origin}${path}`);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  return response.text();
}

test("homepage renders Camotive branding, McLaren hero, and booking navigation", async () => {
  const page = await html("/");
  assert.match(page, /Camotive Detailing/);
  assert.match(page, /work\/mclaren-hero\.jpg/);
  assert.match(page, /href="\/book"/);
  assert.match(page, /href="\/our-work"/);
  assert.doesNotMatch(page, /Your site is taking shape|Building your site/);
});

test("all supported customer pages render", async () => {
  for (const route of ["mobile-detailing", "ceramic-coating", "paint-correction", "locations", "stone-oak", "alamo-heights", "the-dominion", "leon-springs", "downtown", "our-work", "reviews", "contact", "book", "appointment"]) {
    assert.match(await html(`/${route}`), /Camotive/);
  }
});

test("gallery exposes 17 photos and two opt-in video players", async () => {
  const page = await html("/our-work");
  assert.equal((page.match(/aria-label="View full photo:/g) ?? []).length, 17);
  assert.equal((page.match(/<video\b/g) ?? []).length, 2);
  assert.doesNotMatch(page, /<video[^>]*autoplay/i);
  for (const path of ["mclaren-hero.jpg", "mclaren-interior.jpg", "detail-2282.mp4", "detail-2278.mp4"]) {
    const response = await fetch(`${origin}/work/${path}`, { method: "HEAD" });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") ?? "", /image\/jpeg|video\/mp4/);
  }
});

test("Google links open the profile without a forced review form", async () => {
  const page = await html("/reviews");
  assert.match(page, /ludocid=11765857279964552273/);
  assert.doesNotMatch(page, /writereview|review\/create|elfsightcdn/);
});

test("unknown pages return 404", async () => {
  assert.equal((await fetch(`${origin}/not-a-camotive-page`)).status, 404);
});
