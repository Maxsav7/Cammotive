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
    });
    const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('test') } }", compatibilityDate: "2026-05-15", d1Databases: ["DB"] }));
    t.after(() => mf.dispose());
    const database = await mf.getD1Database("DB");
    // Apply the committed Drizzle migrations twice: they must be idempotent so they
    // are safe on a database that already has the legacy/hand-written schema.
    for (let pass = 0; pass < 2; pass++) for (const sql of migrationStatements()) await database.prepare(sql).run();
    let emails = [], failEmail = false, wrongHost = false, dbFailure = false, failOutboxInsert = false;
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
    };
    try {
      await t.test("fails closed while disabled, regardless of submitted data", async () => {
        process.env.BOOKING_ENABLED = "false";
        assert.equal((await route.POST(request(valid()))).status, 503);
        process.env.BOOKING_ENABLED = "true";
        assert.equal(await count("secure_bookings"), 0);
      });
      await t.test("rejects forged prices, unknown fields, invalid dates, types and duplicate addons before writes", async () => {
        for (const changes of [{ total: -999 }, { packageName: "forged" }, { date: "2026-02-30" }, { date: future(-1) }, { date: future(182) }, { name: {} }, { email: "bad" }, { phone: "911" }, { addOnIds: ["engine", "engine"] }, { time: "3:00 AM" }, { name: "x".repeat(101) }]) {
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
        const job = await database.prepare("SELECT payload FROM booking_outbox WHERE id LIKE '%-customer'").first();
        const email = await security.unseal(job.payload); const raw = email.text.match(/#access=([a-f0-9]{64})/)[1];
        assert.ok(!JSON.stringify(row).includes(raw));
        assert.equal((await route.GET(lookup())).status, 401);
        assert.equal((await route.GET(new Request(`https://booking.example.com/api/appointments?code=${result.confirmationCode}`))).status, 401);
        const authorized = await route.GET(lookup(raw)); assert.equal(authorized.status, 200);
        assert.match(authorized.headers.get("cache-control"), /no-store/);
        const view = await authorized.json(); assert.equal(view.appointment.total, 325);
        assert.equal(view.appointment.address, undefined); assert.equal(view.appointment.email, undefined);
        await database.prepare("UPDATE secure_bookings SET token_expires = 0").run();
        assert.equal((await route.GET(lookup(raw))).status, 401);
      });
      await t.test("atomic day capacity and idempotency under concurrent requests", async () => {
        await reset(); const data = valid(), key = crypto.randomUUID();
        const responses = await Promise.all([route.POST(request(data, key)), route.POST(request(data, key))]);
        assert.deepEqual(responses.map(r => r.status).sort(), [200, 201]);
        const codes = await Promise.all(responses.map(r => r.json())); assert.equal(codes[0].confirmationCode, codes[1].confirmationCode);
        assert.equal(await count("secure_bookings"), 1); assert.equal(await count("booking_outbox"), 2);
        assert.equal((await route.POST(request({ ...data, vehicle: "Different car" }, key))).status, 409);
        assert.equal((await route.POST(request({ ...data, time: "4:00 PM" }))).status, 409);
        assert.equal(await count("booking_outbox"), 2);
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
      await t.test("outbox retries use stable provider idempotency and never send SMS", async () => {
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
