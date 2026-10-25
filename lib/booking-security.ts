import { testMode, turnstileVerifyUrl } from "./providers";
import { stripeReady } from "./stripe";
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", ...(status === 429 ? { "Retry-After": "3600" } : {}) } });
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error("booking_operation_failed"); // Deliberately no PII, tokens, SQL or provider errors.
  return json({ error: "Online booking is temporarily unavailable. Please call (210) 573-0671." }, 503);
}
export function configuredOrigin() {
  try {
    const url = new URL(process.env.BOOKING_ORIGIN ?? "");
    // https only; plain http is accepted solely for loopback end-to-end tests.
    const secure = url.protocol === "https:" || (testMode() && url.hostname === "127.0.0.1");
    return secure && url.origin === process.env.BOOKING_ORIGIN ? url.origin : null;
  }
  catch { return null; }
}
export function securityReady() {
  return process.env.BOOKING_ENABLED === "true" && process.env.BOOKING_SCHEDULER_READY === "true" && Boolean(configuredOrigin() && process.env.TURNSTILE_SECRET_KEY &&
    process.env.TURNSTILE_SITE_KEY && process.env.RESEND_API_KEY && process.env.BOOKING_FROM_EMAIL && process.env.CAM_BOOKING_EMAIL &&
    /^[a-f0-9]{64}$/i.test(process.env.BOOKING_ENCRYPTION_KEY ?? "") &&
    (process.env.BOOKING_HASH_SECRET?.length ?? 0) >= 32 && (process.env.BOOKING_CRON_SECRET?.length ?? 0) >= 32 && stripeReady());
}
export async function readJson(request: Request) {
  if (request.headers.get("origin") !== configuredOrigin()) throw new HttpError(403, "Request origin is not allowed.");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new HttpError(415, "JSON is required.");
  if (Number(request.headers.get("content-length") ?? 0) > 8192) throw new HttpError(413, "Request is too large.");
  if (!request.body) throw new HttpError(400, "Invalid request.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) { await reader.cancel(); throw new HttpError(413, "Request is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
  catch { throw new HttpError(400, "Invalid JSON."); }
}
export async function digest(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.BOOKING_HASH_SECRET!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
function hex(bytes: Uint8Array) { return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""); }
export function token() { return hex(crypto.getRandomValues(new Uint8Array(32))); }
async function encryptionKey() {
  return crypto.subtle.importKey("raw", Uint8Array.from(process.env.BOOKING_ENCRYPTION_KEY!.match(/../g)!, b => parseInt(b, 16)), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function seal(value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(JSON.stringify(value))));
  return `${hex(iv)}.${hex(data)}`;
}
export async function unseal(value: string) {
  const [iv, data] = value.split(".").map(s => Uint8Array.from(s.match(/../g)!, b => parseInt(b, 16)));
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await encryptionKey(), data)));
}
export async function verifyBot(value: string, action: string) {
  const response = await fetch(turnstileVerifyUrl(), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: value }), signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Bot verification unavailable");
  const result = await response.json() as { success?: boolean; hostname?: string; action?: string };
  if (!result.success || result.hostname !== new URL(configuredOrigin()!).hostname || result.action !== action)
    throw new HttpError(400, "Please complete the security check again.");
}
