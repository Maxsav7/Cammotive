// Local stand-ins for Cloudflare D1 (REST API), Turnstile siteverify and Resend,
// used only by the end-to-end booking test. The app talks to these when
// TEST_PROVIDER_ORIGIN points at loopback, which is ignored on Vercel.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const port = Number(process.env.FAKE_PROVIDER_PORT ?? 4186);
const db = new DatabaseSync(":memory:");
const migration = new URL("../../drizzle/0000_booking_schema.sql", import.meta.url);
for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
const emails = [];

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
    if (req.method === "GET" && url.pathname === "/__emails") return send(res, 200, emails);
    if (req.method === "GET" && url.pathname === "/__health") return send(res, 200, { ok: true });
    send(res, 404, { error: "not found" });
  } catch (error) {
    // A constraint failure surfaces as a failed D1 request, like the real API.
    send(res, 400, { success: false, errors: [{ message: String(error.message) }] });
  }
}).listen(port, "127.0.0.1", () => console.log(`fake providers on ${port}`));
