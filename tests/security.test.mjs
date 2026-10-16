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
      TURNSTILE_SECRET_KEY: "synthetic", TURNSTILE_SITE_KEY: "synthetic", BREVO_API_KEY: "synthetic",
      BOOKING_FROM_EMAIL: "Camotive Detailing <booking@example.com>", CAM_BOOKING_EMAIL: "owner@example.com",
      BOOKING_ENCRYPTION_KEY: "ab".repeat(32), BOOKING_HASH_SECRET: "synthetic-hash-secret-".repeat(3),
      BOOKING_CRON_SECRET: "synthetic-cron-secret-".repeat(3), VERCEL: "1",
      CLOUDFLARE_ACCOUNT_ID: "test", CLOUDFLARE_D1_DATABASE_ID: "test", CLOUDFLARE_D1_API_TOKEN: "synthetic",
    });
    const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('test') } }", compatibilityDate: "2026-05-15", d1Databases: ["DB"] }));
    t.after(() => mf.dispose());
    const database = await mf.getD1Database("DB");
    // Apply the committed Drizzle migrations twice: they must be idempotent so they
    // are safe on a database that already has the legacy/hand-written schema.
    for (let pass = 0; pass < 2; pass++) for (const sql of migrationStatements()) await database.prepare(sql).run();
    let emails = [], failEmail = false, wrongHost = false, dbFailure = false, failOutboxInsert = false;
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
      if (String(url) === "https://api.brevo.com/v3/smtp/email") {
        assert.equal(options.headers["api-key"], "synthetic");
        const b = JSON.parse(options.body);
        assert.deepEqual(b.sender, { name: "Camotive Detailing", email: "booking@example.com" });
        assert.ok(b.htmlContent && b.textContent, "both HTML and plain text are sent");
        emails.push({ ...({ from: b.sender, to: b.to.map(r => r.email), subject: b.subject, text: b.textContent, html: b.htmlContent, attachments: (b.attachment ?? []).map(a => ({ filename: a.name, content: a.content })) }), id: b.headers["X-Camotive-Job"] });
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
    const access = load(resolve(root, "app/api/appointments/access/route.ts"));
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
    const lookup = value => new Request("https://booking.example.com/api/appointments", { headers: value ? { authorization: `Bearer ${value}` } : {} });
    const count = async table => Number((await database.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n);
    const reset = async () => {
      await database.batch(["booking_outbox", "secure_bookings", "booking_limits", "appointments"].map(table => database.prepare(`DELETE FROM ${table}`)));
      emails = []; failEmail = false; wrongHost = false; dbFailure = false; failOutboxInsert = false;
      googleEvents.clear(); googleBusy = []; googleDown = false;
    };
    const withGoogle = async run => {
      Object.assign(process.env, { GOOGLE_SERVICE_ACCOUNT_EMAIL: "camotive@test.iam.gserviceaccount.com", GOOGLE_SERVICE_ACCOUNT_KEY: googlePem, GOOGLE_CALENDAR_ID: "cam@example.com" });
      try { await run(); } finally { for (const key of ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_KEY", "GOOGLE_CALENDAR_ID"]) delete process.env[key]; }
    };
    try {
      await t.test("fails closed while disabled, regardless of submitted data", async () => {
        process.env.BOOKING_ENABLED = "false";
        assert.equal((await route.POST(request(valid()))).status, 503);
        process.env.BOOKING_ENABLED = "true";
        assert.equal(await count("secure_bookings"), 0);
      });
      await t.test("rejects forged prices, unknown fields, invalid dates, types and duplicate addons before writes", async () => {
        for (const changes of [{ total: -999 }, { packageName: "forged" }, { date: "2026-02-30" }, { date: future(-1) }, { date: future(182) }, { name: {} }, { email: "bad" }, { phone: "911" }, { addOnIds: ["engine", "engine"] }, { time: "3:00 AM" }, { time: "4:00 PM" }, { packageId: "ceramic3" }, { date: chicagoDay(0) }, { name: "x".repeat(101) }]) {
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
      await t.test("server estimate, encrypted PII, opaque token lookup and expiry", async () => {
        await reset(); const response = await route.POST(request(valid())); assert.equal(response.status, 201);
        const result = await response.json(); assert.equal(result.total, 325); assert.match(result.confirmationCode, /^CAM-[A-F0-9]{12}$/);
        const row = await database.prepare("SELECT * FROM secure_bookings").first();
        assert.ok(!JSON.stringify(row).includes("Synthetic Street"));
        const job = await database.prepare("SELECT payload FROM booking_outbox WHERE id LIKE '%-booked'").first();
        const email = await security.unseal(job.payload); const raw = email.text.match(/#access=([a-f0-9]{64})/)[1];
        assert.ok(!JSON.stringify(row).includes(raw));
        assert.equal((await route.GET(lookup())).status, 401);
        assert.equal((await route.GET(new Request(`https://booking.example.com/api/appointments?code=${result.confirmationCode}`))).status, 401);
        const authorized = await route.GET(lookup(raw)); assert.equal(authorized.status, 200);
        assert.match(authorized.headers.get("cache-control"), /no-store/);
        const view = await authorized.json(); assert.equal(view.appointment.total, 325); assert.equal(view.appointment.status, "confirmed");
        assert.match(email.subject, /^Booked/); assert.match(email.text, /You're booked/);
        assert.match(email.html, /You&#39;re booked, Audit\./); assert.match(email.html, /\/brand\/camotive-email-logo\.png/);
        assert.match(Buffer.from(email.attachments[0].content, "base64").toString(), /STATUS:CONFIRMED/);
        assert.equal(view.appointment.address, undefined); assert.equal(view.appointment.email, undefined);
        await database.prepare("UPDATE secure_bookings SET token_expires = 0").run();
        assert.equal((await route.GET(lookup(raw))).status, 401);
      });
      await t.test("atomic slot capacity and idempotency under concurrent requests", async () => {
        await reset(); const data = valid(), key = crypto.randomUUID();
        const responses = await Promise.all([route.POST(request(data, key)), route.POST(request(data, key))]);
        assert.deepEqual(responses.map(r => r.status).sort(), [200, 201]);
        const codes = await Promise.all(responses.map(r => r.json())); assert.equal(codes[0].confirmationCode, codes[1].confirmationCode);
        assert.equal(await count("secure_bookings"), 1); assert.equal(await count("booking_outbox"), 2);
        assert.equal((await route.POST(request({ ...data, vehicle: "Different car" }, key))).status, 409);
        assert.equal((await route.POST(request({ ...data, email: "second@example.com", phone: "2105550124" }))).status, 409, "same slot is taken");
        assert.equal(await count("booking_outbox"), 2);
        assert.equal((await route.POST(request({ ...data, time: "1:00 PM", email: "second@example.com", phone: "2105550124" }))).status, 201, "second slot that day is open");
        await database.prepare("DELETE FROM booking_limits").run(); // fresh per-visitor allowance for the race
        const racing = await Promise.all([3, 4].map(n => route.POST(request({ ...data, date: chicagoDay(9), email: `race${n}@example.com`, phone: `210555012${n}` }))));
        assert.deepEqual(racing.map(r => r.status).sort(), [201, 409], "two people racing for one slot: exactly one wins");
      });
      await t.test("availability shows two slots a day, hides who booked, and releases cancelled slots", async () => {
        await reset();
        const closed = await slots(chicagoDay(0), 2);
        assert.equal(closed.enabled, true);
        assert.deepEqual(closed.days[0].slots.map(s => s.state), ["unavailable", "unavailable"], "today can't be booked");
        assert.deepEqual(closed.days[1].slots.map(s => `${s.time} ${s.state}`), ["8:00 AM open", "1:00 PM open"]);
        assert.equal((await availability.GET(new Request("https://booking.example.com/api/availability?from=bad"))).status, 400);
        await route.POST(request(valid()));
        const after = await slots(valid().date, 1);
        assert.deepEqual(after.days[0].slots.map(s => s.state), ["taken", "open"]);
        assert.ok(!JSON.stringify(after).includes("audit@example.com") && !JSON.stringify(after).includes("CAM-"));
        const { code, token } = await adminLink();
        assert.equal((await decide(code, "cancel", token)).status, 200);
        assert.deepEqual((await slots(valid().date, 1)).days[0].slots.map(s => s.state), ["open", "open"], "cancelled slot is released");
        const cancelled = await sealed("%-cancelled");
        assert.match(cancelled.subject, /^Cancelled/);
        assert.match(Buffer.from(cancelled.attachments[0].content, "base64").toString(), /METHOD:CANCEL[\s\S]*UID:CAM-[A-F0-9]{12}@camotive[\s\S]*SEQUENCE:1/);
        assert.equal((await route.POST(request({ ...valid(), email: "next@example.com", phone: "2105550125" }))).status, 201, "released slot can be booked again");
      });
      await t.test("bookings confirm instantly; only Cam's private link can view and cancel", async () => {
        await reset(); await route.POST(request(valid()));
        assert.equal((await database.prepare("SELECT status FROM secure_bookings").first()).status, "confirmed");
        const cam = await sealed("%-cam");
        assert.equal(cam.to, "owner@example.com"); assert.match(cam.subject, /^New booking/);
        const { code, token } = await adminLink();
        const camIcs = Buffer.from(cam.attachments[0].content, "base64").toString();
        assert.match(camIcs, /BEGIN:VEVENT/); assert.match(camIcs, new RegExp(`UID:${code}@camotive`)); assert.match(camIcs, /DTSTART:\d{8}T1[34]0000Z/, "8:00 AM Chicago is 13:00 or 14:00 UTC");
        assert.equal((await decide(code, "view")).status, 401);
        assert.equal((await decide(code, "view", "f".repeat(64))).status, 401);
        assert.equal((await decide(code, "cancel", token, { origin: "https://evil.example" })).status, 403);
        assert.equal((await decide(code, "approve", token)).status, 400, "approval no longer exists");
        const viewed = await (await decide(code, "view", token)).json();
        assert.equal(viewed.booking.status, "confirmed"); assert.equal(viewed.booking.address, "100 Synthetic Street");
        const cancelled = await decide(code, "cancel", token); assert.equal(cancelled.status, 200);
        assert.equal((await cancelled.json()).booking.status, "cancelled");
        assert.equal((await decide(code, "cancel", token)).status, 409, "already cancelled");
        assert.equal((await database.prepare("SELECT status FROM secure_bookings").first()).status, "cancelled");
      });
      await t.test("customer text is escaped in HTML emails", async () => {
        await reset();
        await route.POST(request({ ...valid(), name: "Eve <img src=x onerror=alert(1)>", vehicle: "Car & \"Co\" <b>bold</b>" }));
        for (const id of ["%-booked", "%-cam"]) {
          const { html } = await sealed(id);
          assert.ok(!/<img src=x|<b>bold/.test(html), id);
          assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/);
        }
      });
      await t.test("maintenance sends one reminder the day before, and none for cancelled bookings", async () => {
        await reset(); await route.POST(request({ ...valid(), date: chicagoDay(1) }));
        await route.POST(request({ ...valid(), date: chicagoDay(1), time: "1:00 PM", email: "gone@example.com", phone: "2105550127" }));
        const gone = (await database.prepare("SELECT code FROM secure_bookings WHERE time = '1:00 PM'").first()).code;
        const cams = await database.prepare("SELECT payload FROM booking_outbox WHERE id LIKE ?").bind(`${gone}-cam`).first();
        const goneToken = (await security.unseal(cams.payload)).text.match(/&token=([a-f0-9]{64})/)[1];
        assert.equal((await decide(gone, "cancel", goneToken)).status, 200);
        const run = async () => (await (await maintenance.POST(new Request("https://booking.example.com/api/internal/booking-maintenance", { method: "POST", headers: { authorization: `Bearer ${process.env.BOOKING_CRON_SECRET}` } }))).json());
        assert.equal((await run()).reminders, 1);
        assert.equal((await run()).reminders, 0, "never twice");
        // Sent payloads are erased from the outbox, so check what reached the email provider.
        const reminders = emails.filter(e => /^Reminder: Camotive detail tomorrow/.test(e.subject));
        assert.equal(reminders.length, 1); assert.deepEqual(reminders[0].to, ["audit@example.com"]);
        assert.ok(reminders[0].html && reminders[0].text, "sent as HTML with a plain-text part");
      });
      await t.test("Google Calendar: bookings are added and removed, busy time blocks slots, outages fail open", () => withGoogle(async () => {
        await reset();
        const { date } = valid();
        // Cam is busy 2–4 PM Chicago on the day: the 1:00 PM slot is taken, 8:00 AM stays open.
        const twoPm = new Date(`${date}T19:00:00Z`).getTime() + (new Date(`${date}T12:00:00Z`).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" }).includes("CDT") ? 0 : 3600000);
        googleBusy = [{ start: new Date(twoPm).toISOString(), end: new Date(twoPm + 2 * 3600000).toISOString() }];
        assert.deepEqual((await slots(date, 1)).days[0].slots.map(s => s.state), ["open", "taken"]);
        assert.equal((await route.POST(request({ ...valid(), time: "1:00 PM" }))).status, 409, "busy on Cam's calendar");
        assert.equal(await count("secure_bookings"), 0);

        const booked = await (await route.POST(request(valid()))).json();
        assert.equal(booked.status, "confirmed");
        assert.equal(await count("booking_outbox"), 3, "two emails and one calendar job");
        const { code, token } = await adminLink(); // read before sending erases the payloads
        await outbox.dispatchEmails(5);
        const id = `camotive${booked.confirmationCode.slice(4).toLowerCase()}`;
        const event = googleEvents.get(id);
        assert.ok(event, "event added to Cam's calendar with a stable id");
        assert.match(event.description, /\+12105550123/); assert.equal(event.location, "100 Synthetic Street");
        assert.equal(Date.parse(event.end.dateTime) - Date.parse(event.start.dateTime), 4 * 3600000);
        // A retried create is harmless (409 from Google counts as done).
        await database.prepare("UPDATE booking_outbox SET status = 'pending', attempts = 0, next_attempt = 0, lease_until = 0, payload = ? WHERE id LIKE '%-calendar'")
          .bind(await security.seal({ kind: "calendar", op: "create", event: { code: booked.confirmationCode, date, time: "8:00 AM", title: "t", location: "l", description: "d" } })).run();
        await outbox.dispatchEmails(5);
        assert.equal(Number((await database.prepare("SELECT count(*) AS n FROM booking_outbox WHERE status = 'sent'").first()).n), 3);

        assert.equal((await decide(code, "cancel", token)).status, 200);
        await outbox.dispatchEmails(5);
        assert.equal(googleEvents.has(id), false, "cancelling removes the event");

        // Google outage: availability and booking keep working on the database alone; the calendar job retries.
        await reset(); googleDown = true; await new Promise(r => setTimeout(r, 0));
        const other = chicagoDay(20);
        assert.deepEqual((await slots(other, 1)).days[0].slots.map(s => s.state), ["open", "open"]);
        const outage = await route.POST(request({ ...valid(), date: other })); assert.equal(outage.status, 201);
        await outbox.dispatchEmails(5);
        assert.equal(Number((await database.prepare("SELECT count(*) AS n FROM booking_outbox WHERE id LIKE '%-calendar' AND status = 'pending'").first()).n), 1, "calendar job waits for a retry");
        googleDown = false;
        await database.prepare("UPDATE booking_outbox SET next_attempt = 0").run();
        await outbox.dispatchEmails(5);
        assert.equal(googleEvents.size, 1);
      }));
      await t.test("a delayed calendar create never re-adds a cancelled booking", () => withGoogle(async () => {
        await reset(); await route.POST(request(valid()));
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
      await t.test("legacy appointments block their date without enabling legacy lookup", async () => {
        await reset();
        await database.prepare("INSERT INTO appointments (confirmation_code, package_id, package_name, date, time, total, name, email, phone, vehicle, address, reminder) VALUES ('CAM-123456', 'full', 'Full', ?, '8:00 AM', 250, 'Legacy', 'test@example.com', '2105550123', 'Car', 'Address', 'none')").bind(valid().date).run();
        assert.equal((await route.POST(request(valid()))).status, 409);
        assert.equal(await count("secure_bookings"), 0); assert.equal(await count("booking_outbox"), 0);
      });
      await t.test("distributed limits are atomic and spoofed generic XFF does not bypass", async () => {
        await reset();
        const limits = await Promise.allSettled(Array.from({ length: 10 }, () => store.limit("test", "same", 3)));
        assert.equal(limits.filter(r => r.status === "fulfilled").length, 3);
        for (let i = 0; i < 5; i++) assert.equal((await route.POST(request({ ...valid(), total: 1 }, undefined, { "x-forwarded-for": String(i) }))).status, 400);
        assert.equal((await route.POST(request(valid(), undefined, { "x-forwarded-for": "another" }))).status, 429);
      });
      await t.test("recovery doesn't reveal match; rotates token and queues encrypted email", async () => {
        await reset(); const result = await (await route.POST(request(valid()))).json();
        const old = await database.prepare("SELECT token_hash FROM secure_bookings").first();
        const good = await access.POST(request({ code: result.confirmationCode, email: valid().email, turnstileToken: "valid-recovery" }));
        const bad = await access.POST(request({ code: result.confirmationCode, email: "other@example.com", turnstileToken: "valid-recovery" }));
        assert.equal(good.status, 202); assert.deepEqual(await good.json(), await bad.json());
        assert.equal(await count("booking_outbox"), 3);
        assert.notEqual((await database.prepare("SELECT token_hash FROM secure_bookings").first()).token_hash, old.token_hash);
      });
      await t.test("outbox retries reuse the same job id and never send SMS", async () => {
        await reset(); await route.POST(request(valid()));
        failEmail = true; assert.equal(await outbox.dispatchEmails(1), 0); const attempted = emails[0].id;
        assert.equal(await count("secure_bookings"), 1);
        await database.prepare("UPDATE booking_outbox SET next_attempt = 0").run();
        failEmail = false; await outbox.dispatchEmails(5);
        assert.equal(emails.filter(e => e.id === attempted).length, 2);
        assert.equal(Number((await database.prepare("SELECT count(*) AS n FROM booking_outbox WHERE status = 'sent' AND payload = ''").first()).n), 2);
        assert.equal(await outbox.dispatchEmails(5), 0);
      });
      await t.test("maintenance is authenticated and purges expired booking data", async () => {
        await reset(); await route.POST(request(valid()));
        assert.equal((await maintenance.POST(new Request("https://booking.example.com/api/internal/booking-maintenance", { method: "POST" }))).status, 401);
        await database.prepare("UPDATE secure_bookings SET delete_after = 0").run();
        const response = await maintenance.POST(new Request("https://booking.example.com/api/internal/booking-maintenance", { method: "POST", headers: { authorization: `Bearer ${process.env.BOOKING_CRON_SECRET}` } }));
        assert.equal(response.status, 200); assert.equal(await count("secure_bookings"), 0); assert.equal(await count("booking_outbox"), 0);
      });
      await t.test("Vercel Cron GET with CRON_SECRET runs maintenance; wrong or weak secrets do not", async () => {
        await reset(); await route.POST(request(valid()));
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
      await t.test("bookings with no queued emails are released by maintenance", async () => {
        await reset(); await route.POST(request(valid()));
        await database.prepare("DELETE FROM booking_outbox").run();
        const run = () => maintenance.POST(new Request("https://booking.example.com/api/internal/booking-maintenance", { method: "POST", headers: { authorization: `Bearer ${process.env.BOOKING_CRON_SECRET}` } }));
        await run(); assert.equal(await count("secure_bookings"), 1, "recent bookings are left alone");
        await database.prepare("UPDATE secure_bookings SET created_at = created_at - 3600").run();
        await run(); assert.equal(await count("secure_bookings"), 0);
      });
      if (runtime === "vercel-rest") await t.test("REST database failure doesn't permit booking", async () => {
        await reset(); dbFailure = true; assert.equal((await route.POST(request(valid()))).status, 503);
      });
      if (runtime === "vercel-rest") await t.test("if queuing emails fails, the booking is undone and the date stays open", async () => {
        await reset(); failOutboxInsert = true;
        assert.equal((await route.POST(request(valid()))).status, 503);
        assert.equal(await count("secure_bookings"), 0); assert.equal(await count("booking_outbox"), 0);
        failOutboxInsert = false;
        assert.equal((await route.POST(request(valid()))).status, 201);
      });
    } finally {
      globalThis.fetch = originalFetch;
      for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
      Object.assign(process.env, originalEnv);
    }
  });
}
