// camotive-db: runs the booking site's database queries on Cloudflare, next to the
// database. The site on Vercel otherwise uses Cloudflare's REST API, where every
// query counts against a limit of 1,200 requests per 5 minutes for Cam's whole
// Cloudflare login (dashboard included). Queries through this Worker's database
// binding don't count against that limit.
//
// It accepts exactly what the REST API accepts ({ sql, params } or { batch: [...] })
// and answers in the same shape, so the site only swaps the URL and the key. Only
// requests carrying the shared secret (DB_PROXY_SECRET, 32+ characters) run; a batch
// runs as one transaction. Database errors aren't echoed back.
// Setup: see VERCEL.md, "Database Worker".

type Statement = { bind(...values: unknown[]): Statement };
type Result = { success: boolean; results?: unknown[]; meta?: unknown };
type Env = { DB: { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<Result[]> }; DB_PROXY_SECRET?: string };
type Query = { sql: string; params?: unknown[] };

const MAX_BODY = 1_000_000, MAX_STATEMENTS = 50;

// Compares fixed-length digests in constant time, so timing reveals nothing about the secret.
async function matches(given: string, expected: string) {
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([hash(given), hash(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const valid = (q: unknown): q is Query => typeof q === "object" && q !== null && typeof (q as Query).sql === "string"
  && (q as Query).sql.length > 0 && ((q as Query).params === undefined || Array.isArray((q as Query).params));

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/query") return reply({ success: false }, 404);
    const secret = env.DB_PROXY_SECRET ?? "";
    if (secret.length < 32 || !await matches(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return reply({ success: false }, 401);
    const text = await request.text();
    if (text.length > MAX_BODY) return reply({ success: false }, 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return reply({ success: false }, 400); }
    const queries: unknown[] = typeof body === "object" && body !== null && Array.isArray((body as { batch?: unknown }).batch) ? (body as { batch: unknown[] }).batch : [body];
    if (!queries.length || queries.length > MAX_STATEMENTS || !queries.every(valid)) return reply({ success: false }, 400);
    try {
      const results = await env.DB.batch((queries as Query[]).map(q => env.DB.prepare(q.sql).bind(...(q.params ?? []))));
      return reply({ success: true, result: results.map(r => ({ success: r.success, results: r.results ?? [], meta: r.meta ?? {} })) });
    } catch {
      return reply({ success: false, errors: [{ message: "Query failed" }] }, 400);
    }
  },
};

export default worker;
