// Local stand-ins for Cloudflare D1 (REST API), Turnstile siteverify, Resend and
// Google Calendar (OAuth token, free/busy, events), used only by the end-to-end
// booking test. The app talks to these when
// TEST_PROVIDER_ORIGIN points at loopback, which is ignored on Vercel.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const port = Number(process.env.FAKE_PROVIDER_PORT ?? 4186);
const db = new DatabaseSync(":memory:");
const migration = new URL("../../drizzle/0000_booking_schema.sql", import.meta.url);
for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
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
    if (req.method === "GET" && url.pathname === "/__calendar") return send(res, 200, [...events.values()]);
    if (req.method === "GET" && url.pathname === "/__emails") return send(res, 200, emails);
    if (req.method === "GET" && url.pathname === "/__health") return send(res, 200, { ok: true });
    send(res, 404, { error: "not found" });
  } catch (error) {
    // A constraint failure surfaces as a failed D1 request, like the real API.
    send(res, 400, { success: false, errors: [{ message: String(error.message) }] });
  }
}).listen(port, "127.0.0.1", () => console.log(`fake providers on ${port}`));
