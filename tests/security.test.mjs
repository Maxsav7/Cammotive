import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const require = createRequire(import.meta.url);
const root = process.cwd();
// Execute actual TypeScript handlers with controlled imports. D1 is real local
// workerd SQLite; all outbound provider/REST HTTP is intercepted below.
function loader(overrides) {
  const cache = new Map();
  function load(file) {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} }; cache.set(file, loadedModule);
    const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = name => {
      if (name in overrides) return overrides[name];
      if (name.startsWith("@/")) return load(resolve(root, name.slice(2)) + ".ts");
      if (name.startsWith(".")) return load(resolve(dirname(file), name) + ".ts");
      return require(name);
    };
    new Function("require", "module", "exports", source)(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}

function migrationStatements() {
  return readdirSync("drizzle").filter(name => name.endsWith(".sql")).sort()
    .flatMap(name => readFileSync(resolve("drizzle", name), "utf8").split("--> statement-breakpoint"))
    .map(sql => sql.replace(/--[^\n]*/g, "").trim()).filter(Boolean);
}

test("migrations apply cleanly over the legacy hand-written schema", async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('test') } }", compatibilityDate: "2026-05-15", d1Databases: ["DB"] }));
  t.after(() => mf.dispose());
  const database = await mf.getD1Database("DB");
  // The schema production databases may already have from the earlier SQL files.
  await database.prepare(`CREATE TABLE appointments (id INTEGER PRIMARY KEY AUTOINCREMENT, confirmation_code TEXT NOT NULL UNIQUE,
    package_id TEXT NOT NULL, package_name TEXT NOT NULL, add_ons TEXT, date TEXT NOT NULL, time TEXT NOT NULL, total INTEGER NOT NULL,
    name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, vehicle TEXT NOT NULL, address TEXT NOT NULL, reminder TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await database.prepare("INSERT INTO appointments (confirmation_code, package_id, package_name, date, time, total, name, email, phone, vehicle, address, reminder) VALUES ('CAM-1', 'full', 'Full', '2030-01-01', '8:00 AM', 250, 'Legacy', 'x@example.com', '2105550123', 'Car', 'Addr', 'none')").run();
  for (const sql of migrationStatements()) await database.prepare(sql).run();
  const tables = (await database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(r => r.name);
  for (const table of ["appointments", "secure_bookings", "booking_limits", "booking_outbox"]) assert.ok(tables.includes(table), table);
  assert.equal(Number((await database.prepare("SELECT count(*) AS n FROM appointments").first()).n), 1);
});

for (const runtime of ["vercel-rest", "cloudflare-binding"]) {
  test(`booking security parity: ${runtime}`, async t => {
    const originalFetch = globalThis.fetch; const originalEnv = { ...process.env };
    Object.assign(process.env, {
      BOOKING_ENABLED: "true", BOOKING_SCHEDULER_READY: "true", BOOKING_ORIGIN: "https://booking.example.com",
      TURNSTILE_SECRET_KEY: "synthetic", TURNSTILE_SITE_KEY: "synthetic", RESEND_API_KEY: "synthetic",
      BOOKING_FROM_EMAIL: "booking@example.com", CAM_BOOKING_EMAIL: "owner@example.com",
      BOOKING_ENCRYPTION_KEY: "ab".repeat(32), BOOKING_HASH_SECRET: "synthetic-hash-secret-".repeat(3),
      BOOKING_CRON_SECRET: "synthetic-cron-secret-".repeat(3), VERCEL: "1",
      CLOUDFLARE_ACCOUNT_ID: "test", CLOUDFLARE_D1_DATABASE_ID: "test", CLOUDFLARE_D1_API_TOKEN: "synthetic",
      STRIPE_SECRET_KEY: "sk_test_synthetic0000", STRIPE_WEBHOOK_SECRET: "whsec_synthetic00000",
    });
    const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('test') } }", compatibilityDate: "2026-05-15", d1Databases: ["DB"] }));
    t.after(() => mf.dispose());
    const database = await mf.getD1Database("DB");
    // Apply the committed Drizzle migrations twice: they must be idempotent so they
    // are safe on a database that already has the legacy/hand-written schema.
    for (let pass = 0; pass < 2; pass++) for (const sql of migrationStatements()) await database.prepare(sql).run();
    let emails = [], failEmail = false, wrongHost = false, dbFailure = false, failOutboxInsert = false;
    // Stripe stand-in: Checkout Sessions by id, refunds, and an outage switch.
    const stripeSessions = new Map(); let refunds = [], stripeDown = false;
    // Google Calendar stand-in: events by id, Cam's existing busy blocks, and an outage switch.
    const googleEvents = new Map(); let googleBusy = [], googleDown = false, googleTokens = 0;
    const googleKeys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    // A throwaway key generated per run; the PEM label is split so the secret scanner ignores it.
    const pemLabel = edge => `-----${edge} PRIVATE` + " KEY-----";
    const googlePem = `${pemLabel("BEGIN")}\\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", googleKeys.privateKey)).toString("base64").match(/.{1,64}/g).join("\\n")}\\n${pemLabel("END")}\\n`;
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith("https://api.cloudflare.com/")) {
        assert.equal(options.cache, "no-store");
        if (dbFailure) return Response.json({ success: false }, { status: 503 });
        const input = JSON.parse(options.body);
        const queries = input.batch ?? [input];
        if (failOutboxInsert && queries.some(q => q.sql.startsWith("INSERT INTO booking_outbox"))) return Response.json({ success: false }, { status: 500 });
        try {
          const result = await database.batch(queries.map(q => database.prepare(q.sql).bind(...q.params)));
          return Response.json({ success: true, result });
        } catch { return Response.json({ success: false }, { status: 400 }); }
      }
      if (String(url).includes("turnstile/v0/siteverify")) {
        const input = JSON.parse(options.body);
        return Response.json({ success: input.response.startsWith("valid-"), hostname: wrongHost ? "evil.example" : "booking.example.com", action: input.response.split("-")[1] });
      }
      if (String(url) === "https://api.resend.com/emails") {
        emails.push({ ...JSON.parse(options.body), id: options.headers["Idempotency-Key"] });
        return Response.json({}, { status: failEmail ? 503 : 200 });
      }
      if (String(url) === "https://oauth2.googleapis.com/token") {
        if (googleDown) return Response.json({}, { status: 503 });
        const [header, claims, signature] = new URLSearchParams(options.body).get("assertion").split(".");
        assert.ok(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", googleKeys.publicKey, Buffer.from(signature, "base64url"), new TextEncoder().encode(`${header}.${claims}`)), "JWT is signed with the service-account key");
        assert.equal(JSON.parse(Buffer.from(claims, "base64url")).iss, "camotive@test.iam.gserviceaccount.com");
        googleTokens++;
        return Response.json({ access_token: "google-token", expires_in: 3600 });
      }
      if (String(url).startsWith("https://api.stripe.com/v1/")) {
        assert.equal(options.headers.Authorization, "Bearer sk_test_synthetic0000");
        if (stripeDown) return Response.json({ error: { message: "down" } }, { status: 503 });
        const path = new URL(url).pathname;
        const form = Object.fromEntries(new URLSearchParams(options.body ?? ""));
        if (path === "/v1/checkout/sessions") {
          const existing = [...stripeSessions.values()].find(x => x.idempotencyKey === options.headers["Idempotency-Key"]);
          if (existing) return Response.json(existing);
          const id = `cs_test_${crypto.randomUUID().replace(/-/g, "")}`;
          const session = { id, url: `https://checkout.stripe.com/c/pay/${id}`, status: "open", payment_status: "unpaid", payment_intent: null,
            amount_total: Number(form["line_items[0][price_data][unit_amount]"]), client_reference_id: form.client_reference_id,
            metadata: { booking_code: form["metadata[booking_code]"] }, form, idempotencyKey: options.headers["Idempotency-Key"] };
          stripeSessions.set(id, session); return Response.json(session);
        }
        const match = /^\/v1\/checkout\/sessions\/([^/]+)(\/expire)?$/.exec(path);
        if (match) {
          const session = stripeSessions.get(match[1]);
          if (!session) return Response.json({}, { status: 404 });
          if (!match[2]) return Response.json(session);
          if (session.status !== "open") return Response.json({}, { status: 400 });
          session.status = "expired"; return Response.json(session);
        }
        if (path === "/v1/refunds") { refunds.push({ ...form, key: options.headers["Idempotency-Key"] }); return Response.json({ id: "re_1" }); }
      }
      if (String(url).startsWith("https://www.googleapis.com/calendar/v3/")) {
        if (googleDown) return Response.json({}, { status: 503 });
        assert.equal(options.headers.Authorization, "Bearer google-token");
        const path = new URL(url).pathname;
        if (path.endsWith("/freeBusy")) {
          const { timeMin, timeMax } = JSON.parse(options.body);
          assert.ok(Date.parse(timeMax) - Date.parse(timeMin) <= 30 * 86400000, "free/busy ranges are at most 30 days");
          return Response.json({ calendars: { "cam@example.com": { busy: googleBusy.filter(b => Date.parse(b.start) < Date.parse(timeMax) && Date.parse(b.end) > Date.parse(timeMin)) } } });
        }
        assert.match(path, /^\/calendar\/v3\/calendars\/cam%40example\.com\/events/);
        if (options.method === "POST") {
          const event = JSON.parse(options.body);
          if (googleEvents.has(event.id)) return Response.json({}, { status: 409 });
          googleEvents.set(event.id, event); return Response.json(event);
        }
        if (options.method === "DELETE") return new Response(null, { status: googleEvents.delete(path.split("/").pop()) ? 204 : 404 });
      }
      throw new Error(`Unexpected network access: ${url}`);
    };
    const overrides = runtime === "cloudflare-binding" ? { "cloudflare:workers": { env: { DB: database } } } : {};
    let load = loader(overrides);
    const adapter = load(resolve(root, runtime === "cloudflare-binding" ? "lib/booking-db.cloudflare.ts" : "lib/booking-db.ts"));
    load = loader({ "@/lib/booking-db": adapter });
    const route = load(resolve(root, "app/api/appointments/route.ts"));
    const webhook = load(resolve(root, "app/api/stripe/webhook/route.ts"));
    const checkout = load(resolve(root, "app/api/checkout/route.ts"));
    const signinCode = load(resolve(root, "app/api/account/code/route.ts"));
    const signin = load(resolve(root, "app/api/account/session/route.ts"));
    const account = load(resolve(root, "app/api/account/appointments/route.ts"));
    const adminCode = load(resolve(root, "app/api/admin/code/route.ts"));
    const adminSignin = load(resolve(root, "app/api/admin/session/route.ts"));
    const dashboard = load(resolve(root, "app/api/admin/dashboard/route.ts"));
    const maintenance = load(resolve(root, "app/api/internal/booking-maintenance/route.ts"));
    const outbox = load(resolve(root, "lib/booking-outbox.ts"));
    const security = load(resolve(root, "lib/booking-security.ts"));
    const store = load(resolve(root, "lib/booking-store.ts"));
    const availability = load(resolve(root, "app/api/availability/route.ts"));
    const admin = load(resolve(root, "app/api/admin/booking/route.ts"));
    const quote = load(resolve(root, "app/api/quote/route.ts"));
    const chicagoDay = (offset = 0) => { const d = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date()) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
    const sealed = async id => security.unseal((await database.prepare("SELECT payload FROM booking_outbox WHERE id LIKE ?").bind(id).first()).payload);
    const adminLink = async () => { const text = (await sealed("%-cam")).text; const m = text.match(/#booking=(CAM-[A-F0-9]{12})&token=([a-f0-9]{64})/); return { code: m[1], token: m[2] }; };
    const decide = (code, action, adminToken, headers = {}) => admin.POST(new Request("https://booking.example.com/api/admin/booking", {
      method: "POST", headers: { origin: "https://booking.example.com", "content-type": "application/json", ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}), ...headers },
      body: JSON.stringify({ code, action }) }));
    const slots = async (from, days = 3) => (await (await availability.GET(new Request(`https://booking.example.com/api/availability?from=${from}&days=${days}`))).json());
    const future = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const valid = () => ({ packageId: "full", vehicleSize: "small", addOnIds: ["engine"], date: future(7), time: "8:00 AM", name: "Audit Customer", email: "audit@example.com", phone: "2105550123", vehicle: "2024 Test Sedan", address: "100 Synthetic Street", turnstileToken: "valid-booking" });
    const request = (data, key = crypto.randomUUID(), headers = {}) => new Request("https://booking.example.com/api/appointments", {
      method: "POST", headers: { origin: "https://booking.example.com", "content-type": "application/json", "idempotency-key": key, ...headers }, body: JSON.stringify(data),
    });
    const count = async table => Number((await database.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n);
    const reset = async () => {
      await database.batch(["booking_outbox", "booking_payments", "secure_bookings", "booking_limits", "appointments", "customer_codes", "customer_sessions", "blocked_slots", "quote_requests"].map(table => database.prepare(`DELETE FROM ${table}`)));
      emails = []; failEmail = false; wrongHost = false; dbFailure = false; failOutboxInsert = false;
      googleEvents.clear(); googleBusy = []; googleDown = false;
      stripeSessions.clear(); refunds = []; stripeDown = false;
    };
    // Stripe webhooks, signed the way Stripe signs them.
    const signed = async (event, { secret = process.env.STRIPE_WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000) } = {}) => {
      const body = JSON.stringify(event);
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`))).toString("hex");
      return new Request("https://booking.example.com/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${signature}` }, body });
    };
    const sessionFor = code => [...stripeSessions.values()].find(x => x.metadata.booking_code === code);
    const pay = async code => {
      const session = sessionFor(code);
      Object.assign(session, { status: "complete", payment_status: "paid", payment_intent: `pi_test_${code.slice(4)}` });
      const response = await webhook.POST(await signed({ type: "checkout.session.completed", data: { object: session } }));
      assert.equal(response.status, 200);
      return session;
    };
    // Books and pays the deposit; returns the booking API's response body.
    const book = async (data = valid(), key) => {
      const response = await route.POST(request(data, key));
      assert.equal(response.status, 201, `booking failed: ${(await response.clone().json()).error}`);
      const result = await response.json();
      await pay(result.confirmationCode);
      return result;
    };
    const run = async () => (await (await maintenance.POST(new Request("https://booking.example.com/api/internal/booking-maintenance", { method: "POST", headers: { authorization: `Bearer ${process.env.BOOKING_CRON_SECRET}` } }))).json());
    const post = (handler, url, body, headers = {}) => handler(new Request(`https://booking.example.com${url}`, { method: "POST", headers: { origin: "https://booking.example.com", "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
    const withGoogle = async run => {
      Object.assign(process.env, { GOOGLE_SERVICE_ACCOUNT_EMAIL: "camotive@test.iam.gserviceaccount.com", GOOGLE_SERVICE_ACCOUNT_KEY: googlePem, GOOGLE_CALENDAR_ID: "cam@example.com" });
      try { await run(); } finally { for (const key of ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_KEY", "GOOGLE_CALENDAR_ID"]) delete process.env[key]; }
    };
    try {
      await t.test("fails closed while disabled, or without Stripe keys, regardless of submitted data", async () => {
        process.env.BOOKING_ENABLED = "false";
        assert.equal((await route.POST(request(valid()))).status, 503);
        process.env.BOOKING_ENABLED = "true";
        const stripeKey = process.env.STRIPE_SECRET_KEY; process.env.STRIPE_SECRET_KEY = "";
        assert.equal((await route.POST(request(valid()))).status, 503);
        process.env.STRIPE_SECRET_KEY = stripeKey;
        assert.equal(await count("secure_bookings"), 0);
      });
      await t.test("rejects forged prices, unknown fields, invalid dates, types and duplicate addons before writes", async () => {
        for (const changes of [{ total: -999 }, { deposit: 1 }, { packageName: "forged" }, { date: "2026-02-30" }, { date: future(-1) }, { date: future(182) }, { name: {} }, { email: "bad" }, { phone: "911" }, { addOnIds: ["engine", "engine"] }, { time: "3:00 AM" }, { time: "1:00 PM" }, { time: "8:00 PM" }, { packageId: "ceramic3" }, { date: chicagoDay(0) }, { name: "x".repeat(101) }]) {
          await reset(); assert.equal((await route.POST(request({ ...valid(), ...changes }))).status, 400);
          assert.equal(await count("secure_bookings"), 0); assert.equal(await count("booking_outbox"), 0);
        }
      });
      await t.test("rejects cross-origin, wrong content-type, invalid JSON and streamed oversized bodies", async () => {
        await reset();
        assert.equal((await route.POST(request(valid(), undefined, { origin: "https://evil.example" }))).status, 403);
        assert.equal((await route.POST(request(valid(), undefined, { "content-type": "text/plain" }))).status, 415);
        assert.equal((await route.POST(request({ padding: "x".repeat(9000) }))).status, 413);
        const malformed = new Request("https://booking.example.com/api/appointments", { method: "POST", headers: { origin: "https://booking.example.com", "content-type": "application/json" }, body: "{" });
        assert.equal((await route.POST(malformed)).status, 400);
        assert.equal(await count("secure_bookings"), 0);
      });
      await t.test("bot success, hostname and action must all match", async () => {
        await reset();
        assert.equal((await route.POST(request({ ...valid(), turnstileToken: "invalid" }))).status, 400);
        assert.equal((await route.POST(request({ ...valid(), turnstileToken: "valid-recovery" }))).status, 400);
        wrongHost = true; assert.equal((await route.POST(request(valid()))).status, 400);
        assert.equal(await count("secure_bookings"), 0);
      });
      await t.test("booking holds the slot and creates a $50 Stripe Checkout; nothing is sent until it's paid", async () => {
        await reset(); const response = await route.POST(request(valid())); assert.equal(response.status, 201);
        const result = await response.json();
        assert.equal(result.total, 325); assert.equal(result.deposit, 50); assert.equal(result.status, "pending");
        assert.match(result.confirmationCode, /^CAM-[A-F0-9]{12}$/); assert.match(result.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
        const session = sessionFor(result.confirmationCode);
        assert.equal(session.amount_total, 5000, "deposit is fixed server-side");
        assert.equal(session.form.mode, "payment"); assert.equal(session.form.customer_email, "audit@example.com");
        assert.ok(Number(session.form.expires_at) - Date.now() / 1000 >= 1800, "Stripe requires at least 30 minutes");
        assert.equal(session.form.success_url, "https://booking.example.com/book?paid={CHECKOUT_SESSION_ID}");
        assert.match(session.form.cancel_url, /\/book\?unpaid=CAM-[A-F0-9]{12}&release=[a-f0-9]{32}$/);
        assert.match(session.form["custom_text[submit][message]"], /non-refundable if you cancel/);
        const row = await database.prepare("SELECT * FROM secure_bookings").first();
        assert.equal(row.status, "pending"); assert.ok(!JSON.stringify(row).includes("Synthetic Street"));
        assert.equal(await count("booking_outbox"), 0, "no confirmation before payment");
        assert.deepEqual((await slots(valid().date, 1)).days[0].slots.map(s => s.state), ["taken", "open", "open"], "the hold blocks the slot");
        await pay(result.confirmationCode);
        assert.equal((await database.prepare("SELECT status FROM secure_bookings").first()).status, "confirmed");
        const payment = await database.prepare("SELECT * FROM booking_payments").first();
        assert.equal(payment.payment_intent, `pi_test_${result.confirmationCode.slice(4)}`); assert.ok(payment.paid_at);
        const email = await sealed("%-booked");
        assert.match(email.subject, /^Booked/); assert.match(email.text, /\$50 deposit is paid/); assert.match(email.text, /non-refundable/);
        assert.match(email.html, /You&#39;re booked, Audit\./); assert.match(email.html, /\/brand\/camotive-email-logo\.png/);
        assert.match(Buffer.from(email.attachments[0].content, "base64").toString(), /STATUS:CONFIRMED/);
        const raw = email.text.match(/#access=([a-f0-9]{64})/)[1];
        assert.ok(!JSON.stringify(await database.prepare("SELECT * FROM secure_bookings").first()).includes(raw), "link token stored only as a hash");
      });
      await t.test("webhooks need a valid, recent Stripe signature, and duplicates are harmless", async () => {
        await reset(); const { confirmationCode: code } = await (await route.POST(request(valid()))).json();
        const session = { ...sessionFor(code), status: "complete", payment_status: "paid", payment_intent: "pi_test_forged" };
        const event = { type: "checkout.session.completed", data: { object: session } };
        assert.equal((await webhook.POST(await signed(event, { secret: "whsec_wrongsecret0000" }))).status, 400);
        assert.equal((await webhook.POST(await signed(event, { t: Math.floor(Date.now() / 1000) - 600 }))).status, 400, "replayed old event");
        const unsigned = new Request("https://booking.example.com/api/stripe/webhook", { method: "POST", body: JSON.stringify(event) });
        assert.equal((await webhook.POST(unsigned)).status, 400);
        assert.equal((await database.prepare("SELECT status FROM secure_bookings").first()).status, "pending");
        const unpaid = { type: "checkout.session.completed", data: { object: { ...session, payment_status: "unpaid" } } };
        assert.equal((await webhook.POST(await signed(unpaid))).status, 200);
        assert.equal((await database.prepare("SELECT status FROM secure_bookings").first()).status, "pending", "unpaid completion doesn't confirm");
        for (let i = 0; i < 3; i++) assert.equal((await webhook.POST(await signed(event))).status, 200);
        assert.equal((await database.prepare("SELECT status FROM secure_bookings").first()).status, "confirmed");
        assert.equal(await count("booking_outbox"), 2, "one confirmation and one notification, however many deliveries");
        assert.equal((await webhook.POST(await signed({ type: "customer.created", data: { object: {} } }))).status, 200, "other events are ignored");
      });
      await t.test("an expired or abandoned checkout releases the slot", async () => {
        await reset();
        const first = await (await route.POST(request(valid()))).json();
        assert.equal((await route.POST(request({ ...valid(), email: "other@example.com", phone: "2105550129" }))).status, 409, "held");
        const expired = { ...sessionFor(first.confirmationCode), status: "expired" };
        assert.equal((await webhook.POST(await signed({ type: "checkout.session.expired", data: { object: expired } }))).status, 200);
        assert.deepEqual((await slots(valid().date, 1)).days[0].slots.map(s => s.state), ["open", "open", "open"]);
        const second = await (await route.POST(request({ ...valid(), email: "other@example.com", phone: "2105550129" }))).json();
        assert.equal(second.status, "pending");
        // "Back" from Stripe: only with the release token from the cancel URL.
        const release = new URL(sessionFor(second.confirmationCode).form.cancel_url).searchParams.get("release");
        assert.equal((await post(checkout.POST, "/api/checkout", { code: second.confirmationCode, release: "0".repeat(32) })).status, 403);
        assert.equal((await post(checkout.POST, "/api/checkout", { code: second.confirmationCode, release })).status, 200);
        assert.equal(sessionFor(second.confirmationCode).status, "expired", "the checkout can't be paid afterwards");
        assert.deepEqual((await slots(valid().date, 1)).days[0].slots.map(s => s.state), ["open", "open", "open"]);
        // A hold that simply runs out frees the slot too, and maintenance tidies it up.
        const third = await (await route.POST(request({ ...valid(), email: "third@example.com", phone: "2105550130" }))).json();
        await database.prepare("UPDATE booking_payments SET hold_expires = 0 WHERE code = ?").bind(third.confirmationCode).run();
        await database.prepare("UPDATE secure_bookings SET created_at = created_at - 600 WHERE code = ?").bind(third.confirmationCode).run();
        assert.deepEqual((await slots(valid().date, 1)).days[0].slots.map(s => s.state), ["open", "open", "open"]);
        await run();
        assert.equal((await database.prepare("SELECT status FROM secure_bookings WHERE code = ?").bind(third.confirmationCode).first()).status, "expired");
      });
      await t.test("payment after the slot was rebooked is refunded automatically", async () => {
        await reset();
        const late = await (await route.POST(request(valid()))).json();
        await database.prepare("UPDATE booking_payments SET hold_expires = 0").run();
        await database.prepare("UPDATE secure_bookings SET created_at = created_at - 600").run();
        await book({ ...valid(), email: "quick@example.com", phone: "2105550131" });
        await pay(late.confirmationCode);
        assert.equal((await database.prepare("SELECT status FROM secure_bookings WHERE code = ?").bind(late.confirmationCode).first()).status, "refunded");
        assert.equal(refunds.length, 1); assert.equal(refunds[0].payment_intent, `pi_test_${late.confirmationCode.slice(4)}`);
        assert.match((await sealed("%-slot-lost")).text, /refunded in full/);
      });
      await t.test("the return page confirms with Stripe directly if the webhook is late", async () => {
        await reset(); const { confirmationCode: code } = await (await route.POST(request(valid()))).json();
        const session = sessionFor(code);
        const status = async () => (await checkout.GET(new Request(`https://booking.example.com/api/checkout?session_id=${session.id}`))).json();
        assert.equal((await status()).status, "pending");
        Object.assign(session, { status: "complete", payment_status: "paid", payment_intent: "pi_test_late" }); // paid, no webhook yet
        const result = await status();
        assert.equal(result.status, "confirmed"); assert.equal(result.deposit, 50); assert.equal(result.email, undefined); assert.equal(result.phone, undefined);
        assert.equal(await count("booking_outbox"), 2);
        assert.equal((await checkout.GET(new Request("https://booking.example.com/api/checkout?session_id=nope"))).status, 400);
      });
      await t.test("atomic slot capacity and idempotency under concurrent requests", async () => {
        await reset(); const data = valid(), key = crypto.randomUUID();
        const responses = await Promise.all([route.POST(request(data, key)), route.POST(request(data, key))]);
        assert.deepEqual(responses.map(r => r.status).sort(), [200, 201]);
        const results = await Promise.all(responses.map(r => r.json()));
        assert.equal(results[0].confirmationCode, results[1].confirmationCode); assert.equal(results[0].checkoutUrl, results[1].checkoutUrl, "a retry gets the same payment page");
        assert.equal(await count("secure_bookings"), 1); assert.equal(stripeSessions.size, 1);
        assert.equal((await route.POST(request({ ...data, vehicle: "Different car" }, key))).status, 409);
        assert.equal((await route.POST(request({ ...data, email: "second@example.com", phone: "2105550124" }))).status, 409, "same slot is held");
        assert.equal((await route.POST(request({ ...data, time: "12:00 PM", email: "second@example.com", phone: "2105550124" }))).status, 201, "second slot that day is open");
        await pay(results[0].confirmationCode);
        assert.equal((await (await route.POST(request(data, key))).json()).status, "confirmed", "a retry after paying reports the booking");
        await database.prepare("DELETE FROM booking_limits").run(); // fresh per-visitor allowance for the race
        const racing = await Promise.all([3, 4].map(n => route.POST(request({ ...data, date: chicagoDay(9), email: `race${n}@example.com`, phone: `210555012${n}` }))));
        assert.deepEqual(racing.map(r => r.status).sort(), [201, 409], "two people racing for one slot: exactly one wins");
      });
      await t.test("if Stripe is down, the hold is released and nothing is booked", async () => {
        await reset(); stripeDown = true;
        assert.equal((await route.POST(request(valid()))).status, 503);
        assert.equal(await count("secure_bookings"), 0);
        stripeDown = false;
        assert.equal((await route.POST(request(valid()))).status, 201);
      });
      await t.test("availability shows two slots a day, hides who booked, and Cam's cancel refunds the deposit", async () => {
        await reset();
        const closed = await slots(chicagoDay(0), 2);
        assert.equal(closed.enabled, true);
        assert.deepEqual(closed.days[0].slots.map(s => s.state), ["unavailable", "unavailable", "unavailable"], "today can't be booked");
        assert.deepEqual(closed.days[1].slots.map(s => `${s.time} ${s.state}`), ["8:00 AM open", "12:00 PM open", "4:00 PM open"]);
        assert.equal((await availability.GET(new Request("https://booking.example.com/api/availability?from=bad"))).status, 400);
        await book();
        const after = await slots(valid().date, 1);
        assert.deepEqual(after.days[0].slots.map(s => s.state), ["taken", "open", "open"]);
        assert.ok(!JSON.stringify(after).includes("audit@example.com") && !JSON.stringify(after).includes("CAM-"));
        const { code, token } = await adminLink();
        assert.equal((await decide(code, "cancel", token)).status, 200);
        assert.equal(refunds.length, 1, "deposit refunded when Camotive cancels"); assert.equal(refunds[0].key, `refund-${code}`);
        assert.deepEqual((await slots(valid().date, 1)).days[0].slots.map(s => s.state), ["open", "open", "open"], "cancelled slot is released");
        const cancelled = await sealed("%-cancelled");
        assert.match(cancelled.subject, /^Cancelled/); assert.match(cancelled.text, /refunded/);
        assert.match(Buffer.from(cancelled.attachments[0].content, "base64").toString(), /METHOD:CANCEL[\s\S]*UID:CAM-[A-F0-9]{12}@camotive[\s\S]*SEQUENCE:1/);
        await book({ ...valid(), email: "next@example.com", phone: "2105550125" });
      });
      await t.test("if the refund fails, Cam's cancel fails and the booking stays", async () => {
        await reset(); await book();
        const { code, token } = await adminLink();
        stripeDown = true;
        assert.equal((await decide(code, "cancel", token)).status, 503);
        assert.equal((await database.prepare("SELECT status FROM secure_bookings").first()).status, "confirmed");
        stripeDown = false;
        assert.equal((await decide(code, "cancel", token)).status, 200);
      });
      await t.test("only Cam's private link can view and cancel", async () => {
        await reset(); await book();
        const cam = await sealed("%-cam");
        assert.equal(cam.to, "owner@example.com"); assert.match(cam.subject, /^New booking/); assert.match(cam.text, /deposit is paid/);
        const { code, token } = await adminLink();
        const camIcs = Buffer.from(cam.attachments[0].content, "base64").toString();
        assert.match(camIcs, /BEGIN:VEVENT/); assert.match(camIcs, new RegExp(`UID:${code}@camotive`)); assert.match(camIcs, /DTSTART:\d{8}T1[34]0000Z/, "8:00 AM Chicago is 13:00 or 14:00 UTC");
        assert.match(camIcs, /DTEND:\d{8}T1[67]0000Z/, "the 8–11 AM window ends at 11:00 Chicago (16:00 or 17:00 UTC)");
        assert.equal((await decide(code, "view")).status, 401);
        assert.equal((await decide(code, "view", "f".repeat(64))).status, 401);
        assert.equal((await decide(code, "cancel", token, { origin: "https://evil.example" })).status, 403);
        assert.equal((await decide(code, "approve", token)).status, 400, "approval no longer exists");
        const viewed = await (await decide(code, "view", token)).json();
        assert.equal(viewed.booking.status, "confirmed"); assert.equal(viewed.booking.address, "100 Synthetic Street");
        const cancelled = await decide(code, "cancel", token); assert.equal(cancelled.status, 200);
        assert.equal((await cancelled.json()).booking.status, "cancelled");
        assert.equal((await decide(code, "cancel", token)).status, 409, "already cancelled");
      });
      await t.test("My appointments: emailed code, uniform responses, 5 tries, then list and cancel (deposit kept)", async () => {
        await reset();
        const mine = await book();
        await book({ ...valid(), time: "12:00 PM", phone: "2105550132" });
        const theirs = await book({ ...valid(), date: chicagoDay(12), email: "someone@example.com", phone: "2105550133" });
        const ask = email => post(signinCode.POST, "/api/account/code", { email, turnstileToken: "valid-recovery" });
        const known = await ask("Audit@Example.com"), unknown = await ask("nobody@example.com");
        assert.equal(known.status, 202); assert.deepEqual(await known.json(), await unknown.json(), "doesn't reveal who has booked");
        assert.equal((await ask("x@example.com").then(r => r.status)), 202);
        assert.equal((await post(signinCode.POST, "/api/account/code", { email: "audit@example.com", turnstileToken: "valid-booking" })).status, 400, "bot action must match");
        const codeEmail = await security.unseal((await database.prepare("SELECT payload FROM booking_outbox WHERE id LIKE 'signin-%'").first()).payload);
        assert.equal(codeEmail.to, "audit@example.com");
        const otp = codeEmail.subject.match(/^(\d{6}) is your/)[1];
        assert.ok(!JSON.stringify(await database.prepare("SELECT * FROM customer_codes").first()).includes(otp), "code stored only as a hash");
        const tryCode = code => post(signin.POST, "/api/account/session", { email: "audit@example.com", code });
        const wrong = otp === "000000" ? "111111" : "000000";
        for (let i = 0; i < 5; i++) assert.equal((await tryCode(wrong)).status, 401);
        assert.equal((await tryCode(otp)).status, 401, "locked after 5 wrong tries");
        await ask("audit@example.com");
        const fresh = (await security.unseal((await database.prepare("SELECT payload FROM booking_outbox WHERE id LIKE 'signin-%' ORDER BY rowid DESC").first()).payload)).subject.slice(0, 6);
        const ok = await tryCode(fresh); assert.equal(ok.status, 201);
        const session = (await ok.json()).session;
        assert.equal((await tryCode(fresh)).status, 401, "single use");
        const list = async (token = session) => account.GET(new Request("https://booking.example.com/api/account/appointments", { headers: { authorization: `Bearer ${token}` } }));
        assert.equal((await list("f".repeat(64))).status, 401);
        const appointments = (await (await list()).json()).appointments;
        assert.equal(appointments.length, 2, "only this email's bookings");
        assert.ok(appointments.every(a => a.canCancel && a.deposit === 50 && a.email === undefined && a.phone === undefined));
        const cancel = (code, token = session) => post(account.POST, "/api/account/appointments", { code }, { authorization: `Bearer ${token}` });
        assert.equal((await cancel(theirs.confirmationCode)).status, 404, "can't cancel someone else's booking");
        assert.equal((await cancel(mine.confirmationCode)).status, 200);
        assert.equal((await cancel(mine.confirmationCode)).status, 409);
        assert.equal(refunds.length, 0, "the deposit is kept when the customer cancels");
        const after = (await (await list()).json()).appointments.find(a => a.code === mine.confirmationCode);
        assert.equal(after.status, "cancelled"); assert.equal(after.cancelledBy, "customer"); assert.equal(after.refunded, false);
        assert.match((await sealed(`${mine.confirmationCode}-cancelled`)).text, /non-refundable/);
        assert.match((await sealed(`${mine.confirmationCode}-cancelled-cam`)).subject, /^Customer cancelled/);
        assert.deepEqual((await slots(valid().date, 1)).days[0].slots.map(s => s.state), ["open", "taken", "open"]);
        // The link in the confirmation email signs in too; sessions expire.
        const access = (await sealed(`${theirs.confirmationCode}-booked`)).text.match(/#access=([a-f0-9]{64})/)[1];
        const viaLink = await post(signin.POST, "/api/account/session", { access });
        assert.equal(viaLink.status, 201);
        assert.equal((await (await list((await viaLink.json()).session)).json()).appointments[0].code, theirs.confirmationCode);
        await database.prepare("UPDATE customer_sessions SET expires = 0").run();
        assert.equal((await list()).status, 401);
      });
      await t.test("customer text is escaped in HTML emails", async () => {
        await reset();
        await book({ ...valid(), name: "Eve <img src=x onerror=alert(1)>", vehicle: "Car & \"Co\" <b>bold</b>" });
        for (const id of ["%-booked", "%-cam"]) {
          const { html } = await sealed(id);
          assert.ok(!/<img src=x|<b>bold/.test(html), id);
          assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/);
        }
      });
      await t.test("maintenance sends one reminder the day before, and none for cancelled bookings", async () => {
        await reset(); await book({ ...valid(), date: chicagoDay(1) });
        const gone = (await book({ ...valid(), date: chicagoDay(1), time: "12:00 PM", email: "gone@example.com", phone: "2105550127" })).confirmationCode;
        const cams = await database.prepare("SELECT payload FROM booking_outbox WHERE id LIKE ?").bind(`${gone}-cam`).first();
        const goneToken = (await security.unseal(cams.payload)).text.match(/&token=([a-f0-9]{64})/)[1];
        assert.equal((await decide(gone, "cancel", goneToken)).status, 200);
        assert.equal((await run()).reminders, 1);
        assert.equal((await run()).reminders, 0, "never twice");
        const reminders = emails.filter(e => /^Reminder: Camotive detail tomorrow/.test(e.subject));
        assert.equal(reminders.length, 1); assert.deepEqual(reminders[0].to, ["audit@example.com"]);
        assert.ok(reminders[0].html && reminders[0].text, "sent as HTML with a plain-text part");
      });
      await t.test("Google Calendar: paid bookings are added and removed, busy time blocks slots, outages fail open", () => withGoogle(async () => {
        await reset();
        const { date } = valid();
        const twoPm = new Date(`${date}T19:00:00Z`).getTime() + (new Date(`${date}T12:00:00Z`).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" }).includes("CDT") ? 0 : 3600000);
        googleBusy = [{ start: new Date(twoPm).toISOString(), end: new Date(twoPm + 2 * 3600000).toISOString() }];
        assert.deepEqual((await slots(date, 1)).days[0].slots.map(s => s.state), ["open", "taken", "open"]);
        assert.equal((await route.POST(request({ ...valid(), time: "12:00 PM" }))).status, 409, "busy on Cam's calendar");
        assert.equal(await count("secure_bookings"), 0);
        const booked = await book();
        assert.equal(await count("booking_outbox"), 3, "two emails and one calendar job, after payment");
        const { code, token } = await adminLink();
        await outbox.dispatchEmails(5);
        const id = `camotive${booked.confirmationCode.slice(4).toLowerCase()}`;
        const event = googleEvents.get(id);
        assert.ok(event, "event added to Cam's calendar with a stable id");
        assert.match(event.description, /\+12105550123/); assert.match(event.description, /deposit paid/); assert.equal(event.location, "100 Synthetic Street");
        assert.equal(Date.parse(event.end.dateTime) - Date.parse(event.start.dateTime), 3 * 3600000, "the 8–11 AM window is three hours");
        assert.equal((await decide(code, "cancel", token)).status, 200);
        await outbox.dispatchEmails(5);
        assert.equal(googleEvents.has(id), false, "cancelling removes the event");
        await reset(); googleDown = true; await new Promise(r => setTimeout(r, 0));
        const other = chicagoDay(20);
        assert.deepEqual((await slots(other, 1)).days[0].slots.map(s => s.state), ["open", "open", "open"]);
        await book({ ...valid(), date: other });
        await outbox.dispatchEmails(5);
        assert.equal(Number((await database.prepare("SELECT count(*) AS n FROM booking_outbox WHERE id LIKE '%-calendar' AND status = 'pending'").first()).n), 1, "calendar job waits for a retry");
        googleDown = false;
        await database.prepare("UPDATE booking_outbox SET next_attempt = 0").run();
        await outbox.dispatchEmails(5);
        assert.equal(googleEvents.size, 1);
      }));
      await t.test("a delayed calendar create never re-adds a cancelled booking", () => withGoogle(async () => {
        await reset(); await book();
        const { code, token } = await adminLink();
        assert.equal((await decide(code, "cancel", token)).status, 200);
        await outbox.dispatchEmails(10);
        assert.equal(googleEvents.size, 0);
        assert.ok(googleTokens > 0);
      }));
      await t.test("quote requests need the bot check, queue two emails and store nothing else", async () => {
        await reset();
        const body = { service: "ceramic", vehicle: "2023 Mustang Mach-E", name: "Quote Customer", email: "quote@example.com", phone: "2105550126", timing: "Next month", notes: "White paint", turnstileToken: "valid-quote" };
        assert.equal((await quote.POST(request({ ...body, service: "rocket" }))).status, 400);
        assert.equal((await quote.POST(request({ ...body, turnstileToken: "valid-booking" }))).status, 400);
        const response = await quote.POST(request(body)); assert.equal(response.status, 201);
        assert.match((await response.json()).reference, /^Q-[A-F0-9]{8}$/);
        assert.equal(await count("booking_outbox"), 2); assert.equal(await count("secure_bookings"), 0);
        assert.equal(Number((await database.prepare("SELECT count(*) AS n FROM booking_outbox WHERE booking_code IS NULL").first()).n), 2);
        assert.match((await sealed("%-cam")).text, /Ceramic coating/);
      });
      await t.test("legacy appointments block their date", async () => {
        await reset();
        await database.prepare("INSERT INTO appointments (confirmation_code, package_id, package_name, date, time, total, name, email, phone, vehicle, address, reminder) VALUES ('CAM-123456', 'full', 'Full', ?, '8:00 AM', 250, 'Legacy', 'test@example.com', '2105550123', 'Car', 'Address', 'none')").bind(valid().date).run();
        assert.equal((await route.POST(request(valid()))).status, 409);
        assert.equal(await count("secure_bookings"), 0); assert.equal(stripeSessions.size, 0);
      });
      await t.test("distributed limits are atomic and spoofed generic XFF does not bypass", async () => {
        await reset();
        const limits = await Promise.allSettled(Array.from({ length: 10 }, () => store.limit("test", "same", 3)));
        assert.equal(limits.filter(r => r.status === "fulfilled").length, 3);
        for (let i = 0; i < 10; i++) assert.equal((await route.POST(request({ ...valid(), total: 1 }, undefined, { "x-forwarded-for": String(i) }))).status, 400);
        assert.equal((await route.POST(request(valid(), undefined, { "x-forwarded-for": "another" }))).status, 429);
      });
      await t.test("outbox retries use stable provider idempotency and never send SMS", async () => {
        await reset(); await book();
        failEmail = true; assert.equal(await outbox.dispatchEmails(1), 0); const attempted = emails[0].id;
        assert.equal(await count("secure_bookings"), 1);
        await database.prepare("UPDATE booking_outbox SET next_attempt = 0").run();
        failEmail = false; await outbox.dispatchEmails(5);
        assert.equal(emails.filter(e => e.id === attempted).length, 2);
        assert.equal(Number((await database.prepare("SELECT count(*) AS n FROM booking_outbox WHERE status = 'sent' AND payload = ''").first()).n), 2);
        assert.equal(await outbox.dispatchEmails(5), 0);
      });
      await t.test("maintenance is authenticated and purges expired booking data", async () => {
        await reset(); await book();
        assert.equal((await maintenance.POST(new Request("https://booking.example.com/api/internal/booking-maintenance", { method: "POST" }))).status, 401);
        await database.prepare("UPDATE secure_bookings SET delete_after = 0").run();
        await database.prepare("INSERT INTO customer_codes (email_hash, code_hash, expires) VALUES ('x', 'y', 0)").run();
        assert.equal((await run()).failed, 0);
        for (const table of ["secure_bookings", "booking_outbox", "booking_payments", "customer_codes"]) assert.equal(await count(table), 0, table);
      });
      await t.test("Vercel Cron GET with CRON_SECRET runs maintenance; wrong or weak secrets do not", async () => {
        await reset(); await book();
        const cron = value => new Request("https://booking.example.com/api/internal/booking-maintenance", { headers: value ? { authorization: `Bearer ${value}` } : {} });
        assert.equal((await maintenance.GET(cron())).status, 401);
        assert.equal((await maintenance.GET(cron("wrong-secret-".repeat(4)))).status, 401);
        process.env.CRON_SECRET = "short";
        assert.equal((await maintenance.GET(cron("short"))).status, 401);
        process.env.CRON_SECRET = "vercel-cron-secret-".repeat(3);
        const response = await maintenance.GET(cron(process.env.CRON_SECRET));
        assert.equal(response.status, 200); assert.equal((await response.json()).sent, 2);
        delete process.env.CRON_SECRET;
      });
      await t.test("a paid booking whose confirmation wasn't queued is sent by maintenance", async () => {
        await reset(); await book();
        await database.prepare("DELETE FROM booking_outbox").run();
        await run();
        assert.equal(await count("secure_bookings"), 1, "paid bookings are never deleted");
        assert.ok(emails.some(e => /^Booked/.test(e.subject)));
      });
      await t.test("dashboard: only the owner's email can sign in, and customer sessions can't open it", async () => {
        await reset(); await book();
        const ask = email => post(adminCode.POST, "/api/admin/code", { email, turnstileToken: "valid-recovery" });
        const owner = await ask("Owner@Example.com"), stranger = await ask("audit@example.com");
        assert.equal(owner.status, 202); assert.deepEqual(await owner.json(), await stranger.json(), "doesn't reveal the owner's address");
        const sent = await database.prepare("SELECT payload FROM booking_outbox WHERE id LIKE 'admin-signin-%'").all();
        assert.equal(sent.results.length, 1, "only the owner gets a code");
        const otp = (await security.unseal(sent.results[0].payload)).subject.slice(0, 6);
        const signIn = (email, code) => post(adminSignin.POST, "/api/admin/session", { email, code });
        assert.equal((await signIn("audit@example.com", otp)).status, 401);
        const wrong = otp === "000000" ? "111111" : "000000";
        for (let i = 0; i < 5; i++) assert.equal((await signIn("owner@example.com", wrong)).status, 401);
        assert.equal((await signIn("owner@example.com", otp)).status, 401, "locked after 5 wrong tries");
        await ask("owner@example.com");
        const fresh = (await security.unseal((await database.prepare("SELECT payload FROM booking_outbox WHERE id LIKE 'admin-signin-%' ORDER BY rowid DESC").first()).payload)).subject.slice(0, 6);
        const ok = await signIn("owner@example.com", fresh); assert.equal(ok.status, 201);
        const session = (await ok.json()).session;
        const view = token => dashboard.GET(new Request("https://booking.example.com/api/admin/dashboard", { headers: token ? { authorization: `Bearer ${token}` } : {} }));
        assert.equal((await view()).status, 401);
        const data = await (await view(session)).json();
        assert.equal(data.upcoming.length, 1); assert.equal(data.upcoming[0].phone, "+12105550123"); assert.equal(data.upcoming[0].address, "100 Synthetic Street");
        assert.equal(data.upcoming[0].deposit, 50); assert.equal(data.upcoming[0].paid, true);
        // A customer signed in to My appointments (even with the owner's email) is not an admin.
        await post(signinCode.POST, "/api/account/code", { email: "audit@example.com", turnstileToken: "valid-recovery" });
        const customerOtp = (await security.unseal((await database.prepare("SELECT payload FROM booking_outbox WHERE id LIKE 'signin-%'").first()).payload)).subject.slice(0, 6);
        const customer = (await (await post(signin.POST, "/api/account/session", { email: "audit@example.com", code: customerOtp })).json()).session;
        assert.equal((await view(customer)).status, 401);
        // Removing the owner's address ends its sessions.
        process.env.CAM_BOOKING_EMAIL = "someone-else@example.com";
        assert.equal((await view(session)).status, 401);
        process.env.CAM_BOOKING_EMAIL = "owner@example.com";
        assert.equal((await view(session)).status, 200);
      });
      const adminSession = async () => {
        await post(adminCode.POST, "/api/admin/code", { email: "owner@example.com", turnstileToken: "valid-recovery" });
        const otp = (await security.unseal((await database.prepare("SELECT payload FROM booking_outbox WHERE id LIKE 'admin-signin-%' ORDER BY rowid DESC").first()).payload)).subject.slice(0, 6);
        return (await (await post(adminSignin.POST, "/api/admin/session", { email: "owner@example.com", code: otp })).json()).session;
      };
      await t.test("dashboard: move a booking, cancel with refund, block time, and track quotes", async () => {
        await reset();
        const first = await book();
        const other = await book({ ...valid(), time: "12:00 PM", email: "other@example.com", phone: "2105550140" });
        const session = await adminSession();
        const act = body => post(dashboard.POST, "/api/admin/dashboard", body, { authorization: `Bearer ${session}` });
        assert.equal((await post(dashboard.POST, "/api/admin/dashboard", { action: "cancel", code: first.confirmationCode })).status, 401);
        assert.equal((await post(dashboard.POST, "/api/admin/dashboard", { action: "cancel", code: first.confirmationCode }, { authorization: `Bearer ${session}`, origin: "https://evil.example" })).status, 403);
        // Move: not onto a booked window; then to an open one, emailing the customer an updated invite.
        assert.equal((await act({ action: "reschedule", code: first.confirmationCode, date: valid().date, time: "12:00 PM" })).status, 409);
        assert.equal((await act({ action: "reschedule", code: first.confirmationCode, date: chicagoDay(-1), time: "4:00 PM" })).status, 400, "not into the past");
        assert.equal((await act({ action: "reschedule", code: first.confirmationCode, date: valid().date, time: "4:00 PM" })).status, 200);
        assert.deepEqual((await slots(valid().date, 1)).days[0].slots.map(s => s.state), ["open", "taken", "taken"]);
        const moved = await sealed(`${first.confirmationCode}-moved-1`);
        assert.match(moved.subject, /^Moved: now/); assert.match(moved.text, /Was: .*8–11 AM/); assert.match(moved.text, /Now: .*4–8 PM/);
        const ics = Buffer.from(moved.attachments[0].content, "base64").toString();
        assert.match(ics, /SEQUENCE:1/); assert.match(ics, new RegExp(`UID:${first.confirmationCode}@camotive`)); assert.match(ics, /DTSTART:\d{8}T2[12]0000Z/, "4:00 PM Chicago");
        // Cancel with refund.
        assert.equal((await act({ action: "cancel", code: other.confirmationCode })).status, 200);
        assert.equal(refunds.length, 1);
        assert.equal((await act({ action: "cancel", code: other.confirmationCode })).status, 409);
        // Block a window and a whole day: shown as taken, and can't be booked.
        const day = chicagoDay(15);
        assert.equal((await act({ action: "block", date: day, times: ["8:00 AM"] })).status, 200);
        assert.deepEqual((await slots(day, 1)).days[0].slots.map(s => s.state), ["taken", "open", "open"]);
        assert.equal((await route.POST(request({ ...valid(), date: day, email: "blocked@example.com", phone: "2105550141" }))).status, 409);
        assert.equal((await act({ action: "block", date: chicagoDay(16), times: ["all"] })).status, 200);
        assert.deepEqual((await slots(chicagoDay(16), 1)).days[0].slots.map(s => s.state), ["taken", "taken", "taken"]);
        const blockedWithBooking = await (await act({ action: "block", date: valid().date, times: ["all"] })).json();
        assert.equal(blockedWithBooking.existingBookings, 1, "Cam is told a booking is already on that day");
        assert.equal((await act({ action: "unblock", date: day, time: "8:00 AM" })).status, 200);
        assert.deepEqual((await slots(day, 1)).days[0].slots.map(s => s.state), ["open", "open", "open"]);
        assert.equal((await act({ action: "block", date: day, times: ["9:00 PM"] })).status, 400);
        // Quotes are kept for the dashboard and can be marked replied.
        const body = { service: "ceramic", vehicle: "2023 Mustang Mach-E", name: "Quote Customer", email: "quote@example.com", phone: "2105550126", timing: "", notes: "White paint", turnstileToken: "valid-quote" };
        const { reference } = await (await quote.POST(request(body))).json();
        assert.ok(!JSON.stringify(await database.prepare("SELECT * FROM quote_requests").first()).includes("Mach-E"), "stored encrypted");
        let data = await (await dashboard.GET(new Request("https://booking.example.com/api/admin/dashboard", { headers: { authorization: `Bearer ${session}` } }))).json();
        assert.equal(data.quotes[0].reference, reference); assert.equal(data.quotes[0].vehicle, "2023 Mustang Mach-E"); assert.equal(data.quotes[0].status, "new");
        assert.equal((await act({ action: "quote", reference, status: "replied" })).status, 200);
        data = await (await dashboard.GET(new Request("https://booking.example.com/api/admin/dashboard", { headers: { authorization: `Bearer ${session}` } }))).json();
        assert.equal(data.quotes[0].status, "replied");
        assert.equal(data.upcoming[0].moved, true); assert.equal(data.recent[0].status, "cancelled");
      });
      await t.test("dashboard works before online payment is set up", async () => {
        await reset();
        const saved = { enabled: process.env.BOOKING_ENABLED, stripe: process.env.STRIPE_SECRET_KEY };
        process.env.BOOKING_ENABLED = "false"; process.env.STRIPE_SECRET_KEY = "";
        try {
          const session = await adminSession();
          assert.match(session, /^[a-f0-9]{64}$/);
          assert.equal((await post(dashboard.POST, "/api/admin/dashboard", { action: "block", date: chicagoDay(5), times: ["all"] }, { authorization: `Bearer ${session}` })).status, 200);
          assert.deepEqual((await slots(chicagoDay(5), 1)).days[0].slots.map(s => s.state), ["taken", "taken", "taken"], "the text-booking calendar honors blocks");
          assert.equal((await route.POST(request(valid()))).status, 503, "online booking itself stays off");
        } finally { process.env.BOOKING_ENABLED = saved.enabled; process.env.STRIPE_SECRET_KEY = saved.stripe; }
      });
      if (runtime === "vercel-rest") await t.test("REST database failure doesn't permit booking", async () => {
        await reset(); dbFailure = true; assert.equal((await route.POST(request(valid()))).status, 503);
      });
      if (runtime === "vercel-rest") await t.test("if queuing the confirmation fails, Stripe's retry delivers it", async () => {
        await reset(); const { confirmationCode: code } = await (await route.POST(request(valid()))).json();
        failOutboxInsert = true;
        const session = Object.assign(sessionFor(code), { status: "complete", payment_status: "paid", payment_intent: "pi_test_retry" });
        assert.equal((await webhook.POST(await signed({ type: "checkout.session.completed", data: { object: session } }))).status, 503, "non-2xx makes Stripe retry");
        failOutboxInsert = false;
        assert.equal((await webhook.POST(await signed({ type: "checkout.session.completed", data: { object: session } }))).status, 200);
        assert.equal(await count("booking_outbox"), 2);
      });
    } finally {
      globalThis.fetch = originalFetch;
      for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
      Object.assign(process.env, originalEnv);
    }
  });
}
