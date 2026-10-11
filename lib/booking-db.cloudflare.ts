import { env } from "cloudflare:workers";
export { env };
export function databaseReady() { return Boolean(env.DB); }
export function clientAddress(request: Request) { return request.headers.get("cf-connecting-ip") || "unknown"; }
