// Local stand-ins for Cloudflare D1 (REST API), Turnstile siteverify, Resend,
// Google Calendar (OAuth token, free/busy, events) and Stripe (Checkout Sessions,
// a hosted "checkout page", signed webhooks, refunds), used only by the end-to-end
// booking test. The app talks to these when
// TEST_PROVIDER_ORIGIN points at loopback, which is ignored on Vercel.
import { createServer } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { createHmac, createPublicKey, randomBytes, verify } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const port = Number(process.env.FAKE_PROVIDER_PORT ?? 4186);
const db = new DatabaseSync(":memory:");
for (const name of readdirSync(new URL("../../drizzle/", import.meta.url)).filter(n => n.endsWith(".sql")).sort()) {
  const migration = new URL(`../../drizzle/${name}`, import.meta.url);
  for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
}
const emails = [];
// Google Calendar: events by id, plus busy blocks Cam already has (set by the config).
const events = new Map();
const busy = JSON.parse(process.env.FAKE_GOOGLE_BUSY ?? "[]");
const googleKey = process.env.FAKE_GOOGLE_PUBLIC_KEY ? createPublicKey(process.env.FAKE_GOOGLE_PUBLIC_KEY) : null;
const GOOGLE_TOKEN = "fake-google-access-token";
// Checks the service-account JWT the way Google does: RS256 signature and claims.
function validAssertion(assertion) {
  const [header, claims, signature] = String(assertion ?? "").split(".");
  if (!googleKey || !signature) return false;
  if (!verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), googleKey, Buffer.from(signature, "base64url"))) return false;
  const c = JSON.parse(Buffer.from(claims, "base64url"));
  const now = Date.now() / 1000;
  return c.iss === "camotive@test.iam.gserviceaccount.com" && c.aud === "https://oauth2.googleapis.com/token" && c.exp > now && c.iat <= now + 5 && /calendar\.events/.test(c.scope);
}

function run({ sql, params = [] }) {
  const statement = db.prepare(sql);
  const values = params.map(v => typeof v === "boolean" ? Number(v) : v);
  if (statement.columns().length) return { success: true, results: statement.all(...values), meta: {} };
  const info = statement.run(...values);
  return { success: true, results: [], meta: { changes: Number(info.changes) } };
}

// Stripe: sessions by id, idempotency keys, refunds. Payment happens on /pay/:id,
// which stands in for Stripe's hosted Checkout page.
const sessions = new Map(), idempotent = new Map(), refunds = [];
const STRIPE_KEY = "sk_test_fakeprovider000";
async function webhook(type, session) {
  const body = JSON.stringify({ id: `evt_${randomBytes(8).toString("hex")}`, type, data: { object: session } });
  const t = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", process.env.FAKE_STRIPE_WEBHOOK_SECRET).update(`${t}.${body}`).digest("hex");
  const response = await fetch(process.env.FAKE_STRIPE_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${signature}` }, body });
  if (!response.ok) console.error(`webhook ${type} -> ${response.status}`);
}
// Bracketed form keys (line_items[0][price_data][unit_amount]) into a flat lookup.
const formObject = raw => Object.fromEntries(new URLSearchParams(raw));
const html = (res, body) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(`<!doctype html><html lang="en"><head><title>Fake Stripe Checkout</title></head><body>${body}</body></html>`); };

const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

createServer(async (req, res) => {
  let raw = ""; for await (const chunk of req) raw += chunk;
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  try {
    if (req.method === "POST" && /\/client\/v4\/accounts\/[^/]+\/d1\/database\/[^/]+\/query$/.test(url.pathname)) {
      const body = JSON.parse(raw);
      const queries = body.batch ?? [body];
      if (body.batch) {
        db.exec("BEGIN");
        try { const result = queries.map(run); db.exec("COMMIT"); return send(res, 200, { success: true, result }); }
        catch (error) { db.exec("ROLLBACK"); throw error; }
      }
      return send(res, 200, { success: true, result: queries.map(run) });
    }
    if (req.method === "POST" && url.pathname === "/turnstile/v0/siteverify") {
      const { response } = JSON.parse(raw);
      const action = /^test-(booking|recovery|quote)$/.exec(response ?? "")?.[1];
      return send(res, 200, action ? { success: true, hostname: "127.0.0.1", action } : { success: false });
    }
    if (req.method === "POST" && url.pathname === "/emails") {
      const email = JSON.parse(raw); emails.push(email);
      return send(res, 200, { id: `email-${emails.length}` });
    }
    if (req.method === "POST" && url.pathname === "/token") {
      const form = new URLSearchParams(raw);
      if (form.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer" || !validAssertion(form.get("assertion"))) return send(res, 400, { error: "invalid_grant" });
      return send(res, 200, { access_token: GOOGLE_TOKEN, expires_in: 3600, token_type: "Bearer" });
    }
    if (url.pathname.startsWith("/calendar/v3/")) {
      if (req.headers.authorization !== `Bearer ${GOOGLE_TOKEN}`) return send(res, 401, { error: "unauthorized" });
      if (req.method === "POST" && url.pathname === "/calendar/v3/freeBusy") {
        const { timeMin, timeMax, items } = JSON.parse(raw);
        const inRange = [...busy, ...[...events.values()].map(e => ({ start: e.start.dateTime, end: e.end.dateTime }))]
          .filter(b => Date.parse(b.start) < Date.parse(timeMax) && Date.parse(b.end) > Date.parse(timeMin));
        return send(res, 200, { calendars: { [items[0].id]: { busy: inRange } } });
      }
      const match = /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);
      if (match && decodeURIComponent(match[1]) !== "cam@example.com") return send(res, 404, { error: "calendar not found" });
      if (match && req.method === "POST" && !match[2]) {
        const event = JSON.parse(raw);
        if (!/^[a-v0-9]{5,1024}$/.test(event.id)) return send(res, 400, { error: "invalid id" });
        if (events.has(event.id)) return send(res, 409, { error: "duplicate" });
        events.set(event.id, event);
        return send(res, 200, event);
      }
      if (match && req.method === "DELETE" && match[2]) {
        if (!events.delete(match[2])) return send(res, 404, { error: "not found" });
        res.writeHead(204); return res.end();
      }
    }
    if (url.pathname.startsWith("/v1/")) {
      if (req.headers.authorization !== `Bearer ${STRIPE_KEY}`) return send(res, 401, { error: { message: "Invalid API key" } });
      const key = req.headers["idempotency-key"];
      if (key && idempotent.has(key)) return send(res, 200, idempotent.get(key));
      if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
        const f = formObject(raw);
        const id = `cs_test_${randomBytes(12).toString("hex")}`;
        const session = { id, object: "checkout.session", url: `http://127.0.0.1:${port}/pay/${id}`, status: "open", payment_status: "unpaid", payment_intent: null,
          amount_total: Number(f["line_items[0][price_data][unit_amount]"]), client_reference_id: f.client_reference_id, metadata: { booking_code: f["metadata[booking_code]"] },
          customer_email: f.customer_email, success_url: f.success_url, cancel_url: f.cancel_url, expires_at: Number(f.expires_at),
          name: f["line_items[0][price_data][product_data][name]"] };
        if (f.mode !== "payment" || !(session.expires_at - Date.now() / 1000 >= 1800)) return send(res, 400, { error: { message: "invalid params" } });
        sessions.set(id, session); if (key) idempotent.set(key, session);
        return send(res, 200, session);
      }
      const match = /^\/v1\/checkout\/sessions\/([^/]+)(\/expire)?$/.exec(url.pathname);
      if (match) {
        const session = sessions.get(match[1]);
        if (!session) return send(res, 404, { error: { message: "No such session" } });
        if (!match[2]) return send(res, 200, session);
        if (session.status !== "open") return send(res, 400, { error: { message: "Session is not open" } });
        session.status = "expired"; await webhook("checkout.session.expired", session);
        return send(res, 200, session);
      }
      if (req.method === "POST" && url.pathname === "/v1/refunds") {
        const refund = { id: `re_${randomBytes(8).toString("hex")}`, ...formObject(raw) }; refunds.push(refund); if (key) idempotent.set(key, refund);
        return send(res, 200, refund);
      }
    }
    // The stand-in "Stripe Checkout" page: pay, or go back without paying.
    const pay = /^\/pay\/(cs_test_[a-f0-9]+)$/.exec(url.pathname);
    if (pay) {
      const session = sessions.get(pay[1]);
      if (!session) return send(res, 404, { error: "no session" });
      if (req.method === "GET") return html(res, `<main><h1>Fake Stripe Checkout</h1><p>${session.name}</p><p>Pay $${(session.amount_total / 100).toFixed(2)}</p>
        <form method="post"><button type="submit">Pay $${(session.amount_total / 100).toFixed(2)}</button></form><a href="${session.cancel_url}">Back</a></main>`);
      if (session.status !== "open") return send(res, 400, { error: "session not open" });
      Object.assign(session, { status: "complete", payment_status: "paid", payment_intent: `pi_test_${randomBytes(8).toString("hex")}` });
      // ?webhook=late skips the webhook, to test the return page confirming with Stripe directly.
      if (url.searchParams.get("webhook") !== "late") await webhook("checkout.session.completed", session);
      res.writeHead(303, { location: session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id) }); return res.end();
    }
    if (req.method === "GET" && url.pathname === "/__refunds") return send(res, 200, refunds);
    if (req.method === "GET" && url.pathname === "/__calendar") return send(res, 200, [...events.values()]);
    if (req.method === "GET" && url.pathname === "/__emails") return send(res, 200, emails);
    if (req.method === "GET" && url.pathname === "/__health") return send(res, 200, { ok: true });
    send(res, 404, { error: "not found" });
  } catch (error) {
    // A constraint failure surfaces as a failed D1 request, like the real API.
    send(res, 400, { success: false, errors: [{ message: String(error.message) }] });
  }
}).listen(port, "127.0.0.1", () => console.log(`fake providers on ${port}`));
