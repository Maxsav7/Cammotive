import { d1Api } from "./providers";
// Server-only D1 access for Node/Vercel. Cloudflare builds use the native binding.
// With D1_PROXY_URL and D1_PROXY_SECRET set, queries go through the camotive-db
// Worker (db-worker/), which doesn't count against Cloudflare's API request limit;
// otherwise through Cloudflare's REST API.
function viaWorker() {
  return /^https:\/\/[^/]+/.test(process.env.D1_PROXY_URL ?? "") && (process.env.D1_PROXY_SECRET ?? "").length >= 32;
}
export function databaseReady() {
  return viaWorker() || Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_D1_DATABASE_ID && process.env.CLOUDFLARE_D1_API_TOKEN);
}
function endpoint() {
  if (viaWorker()) return { url: `${process.env.D1_PROXY_URL!.replace(/\/+$/, "")}/query`, key: process.env.D1_PROXY_SECRET! };
  const account = encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID!);
  const database = encodeURIComponent(process.env.CLOUDFLARE_D1_DATABASE_ID!);
  return { url: `${d1Api()}/accounts/${account}/d1/database/${database}/query`, key: process.env.CLOUDFLARE_D1_API_TOKEN! };
}

export function clientAddress(request: Request) {
  return process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || "unknown" : "unknown";
}
type Query = { sql: string; params: unknown[] };
type Result = { success: boolean; results: Record<string, unknown>[] };
async function query(queries: Query[]): Promise<Result[]> {
    if (!databaseReady()) throw new Error("Booking database is not configured");
    const { url, key } = endpoint();
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(queries.length === 1 ? queries[0] : { batch: queries }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Booking database request failed");
    const body = await response.json() as { success: boolean; result?: Result[] };
    if (!body.success || !body.result?.length || body.result.some(r => !r.success)) throw new Error("Booking database query failed");
    return body.result;
}
function prepare(sql: string, params: unknown[] = []) {
  return {
    sql, params,
    bind: (...values: unknown[]) => prepare(sql, values),
    run: async () => (await query([{ sql, params }]))[0],
    all: async () => (await query([{ sql, params }]))[0],
    first: async () => (await query([{ sql, params }]))[0].results?.[0] ?? null,
  };
}

export const env = { DB: { prepare, batch: (statements: Query[]) => query(statements) } };
