import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { before, after, test } from "node:test";

const origin = "http://127.0.0.1:4179";
const useNext = process.env.TEST_RUNTIME === "next";
let server;
let logs = "";

before(async () => {
  // Cloudflare modules require workerd rather than Node's ESM loader.
  server = spawn(process.execPath, useNext ? ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4179"] : [
    "node_modules/wrangler/bin/wrangler.js", "dev",
    "--config", "dist/server/wrangler.json", "--local",
    "--ip", "127.0.0.1", "--port", "4179", "--inspector-port", "0",
  ], { env: { ...process.env, BOOKING_ENABLED: "false", CLOUDFLARE_D1_API_TOKEN: "", CI: "true", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] });
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

test("services are described plainly, as a team, with no tint and no repeated photos", async () => {
  const page = await html("/");
  for (const id of ["story-exterior", "story-interior", "story-correction", "story-coating"]) {
    assert.match(page, new RegExp(`id="${id}"`));
    assert.match(page, new RegExp(`href="#${id}"`));
  }
  assert.doesNotMatch(page, /tint/i);
  const photos = [...page.matchAll(/src="\/work\/([a-z0-9-]+)\.jpg"/g)].map(m => m[1]);
  assert.equal(new Set(photos).size, photos.length, `repeated photo on the homepage: ${photos}`);
});

test("customer-facing pages never name an individual", async () => {
  for (const route of ["", "mobile-detailing", "ceramic-coating", "paint-correction", "book", "quote", "contact", "reviews", "appointment", "locations"]) {
    assert.doesNotMatch(await html(`/${route}`), /\bCam\b/, `/${route} mentions Cam`);
  }
});

test("gallery exposes 15 distinct photos and three opt-in video players, one Lamborghini foam wash", async () => {
  const page = await html("/our-work");
  assert.equal((page.match(/aria-label="View full photo:/g) ?? []).length, 15);
  assert.equal((page.match(/<video\b/g) ?? []).length, 3);
  assert.equal((page.match(/<video[^>]*aria-label="Lamborghini/g) ?? []).length, 1);
  assert.doesNotMatch(page, /<video[^>]*autoplay/i);
  for (const path of ["mclaren-hero.jpg", "mclaren-interior.jpg", "detail-2282.mp4", "detail-2278.mp4", "mach-e-front.jpg", "mach-e-ceramic.mp4", "glass-coating.mp4"]) {
    const response = await fetch(`${origin}/work/${path}`, { method: "HEAD" });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") ?? "", /image\/jpeg|video\/mp4/);
  }
});

test("no customer page shows the same photo twice", async () => {
  for (const route of ["", "mobile-detailing", "ceramic-coating", "paint-correction", "locations", "stone-oak", "our-work", "reviews", "contact", "book", "quote", "appointment"]) {
    const photos = [...(await html(`/${route}`)).matchAll(/src="\/work\/([a-z0-9-]+)\.jpg"/g)].map(m => m[1]);
    const repeated = photos.filter((photo, i) => photos.indexOf(photo) !== i);
    assert.deepEqual(repeated, [], `/${route} repeats ${repeated}`);
  }
});

test("Reviews in the navigation goes straight to the Google profile", async () => {
  const page = await html("/");
  const reviewLinks = [...page.matchAll(/<a[^>]*href="([^"]*)"[^>]*>Reviews(?:<span[^>]*>[^<]*<\/span>)?<\/a>/g)].map(m => m[1]);
  assert.ok(reviewLinks.length >= 2, `expected header and footer Reviews links, found ${reviewLinks.length}`);
  for (const href of reviewLinks) assert.match(href, /ludocid=11765857279964552273/, `Reviews link points to ${href}`);
});

test("Google links open the profile without a forced review form", async () => {
  const page = await html("/reviews");
  assert.match(page, /ludocid=11765857279964552273/);
  assert.doesNotMatch(page, /writereview|review\/create|elfsightcdn/);
});

test("inner pages show a breadcrumb trail naming the current page", async () => {
  const expected = { "our-work": ["Our Work"], "ceramic-coating": ["Ceramic Coating"], contact: ["Contact"], "stone-oak": ["Service area", "Stone Oak"] };
  for (const [route, trail] of Object.entries(expected)) {
    const page = await html(`/${route}`);
    const nav = page.match(/<nav[^>]*aria-label="Breadcrumb"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav, `/${route} has no breadcrumb`);
    assert.match(nav, /href="\/"[^>]*>Home</);
    assert.match(nav, new RegExp(`aria-current="page"[^>]*>${trail.at(-1)}<`));
    if (trail.length > 1) assert.match(nav, new RegExp(`href="/locations"[^>]*>${trail[0]}<`));
    assert.doesNotMatch(page, />Home \/</);
  }
});

test("unknown pages return 404", async () => {
  assert.equal((await fetch(`${origin}/not-a-camotive-page`)).status, 404);
});

test("unconfigured booking fails closed on either runtime", async () => {
  const json = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" };
  for (const [path, options] of [["/api/appointments", json], ["/api/stripe/webhook", json], ["/api/account/code", json], ["/api/account/session", json],
    ["/api/account/appointments", { method: "GET" }], ["/api/checkout?session_id=cs_test_aaaaaaaaaaaa", { method: "GET" }]]) {
    const response = await fetch(`${origin}${path}`, options);
    assert.equal(response.status, 503, path);
    const body = await response.json();
    assert.match(body.error, /temporarily unavailable/);
    assert.equal(body.confirmationCode, undefined);
  }
});

test("security headers and private API cache policy are present", async () => {
  const response = await fetch(origin);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const status = await fetch(`${origin}/api/appointments/status`);
  assert.match(status.headers.get("cache-control"), /no-store/);
  assert.equal((await status.json()).enabled, false);
  assert.doesNotMatch(await html("/book"), /<form/);
});
