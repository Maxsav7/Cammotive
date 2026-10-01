// Server-only D1 access for Node/Vercel. Cloudflare builds use the native binding.
export function databaseReady() {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_D1_DATABASE_ID && process.env.CLOUDFLARE_D1_API_TOKEN);
}

function prepare(sql: string, params: unknown[] = []) {
  async function query() {
    if (!databaseReady()) throw new Error("Booking database is not configured");
    const account = encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID!);
    const database = encodeURIComponent(process.env.CLOUDFLARE_D1_DATABASE_ID!);
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_D1_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Booking database request failed");
    const body = await response.json() as { success: boolean; result?: { success: boolean; results?: Record<string, unknown>[] }[] };
    if (!body.success || !body.result?.[0]?.success) throw new Error("Booking database query failed");
    return body.result[0];
  }
  return {
    bind: (...values: unknown[]) => prepare(sql, values),
    run: query,
    first: async () => (await query()).results?.[0] ?? null,
  };
}

export const env = { DB: { prepare } };
