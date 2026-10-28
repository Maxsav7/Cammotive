// Password hashing for Cam's dashboard, with WebCrypto only (runs the same on
// Vercel and Cloudflare Workers). PBKDF2-SHA256 with a random 16-byte salt per
// password, over an HMAC pre-hash keyed with BOOKING_HASH_SECRET (a "pepper"), so
// the stored hash is useless without the server secret. 100,000 iterations is the
// most Cloudflare Workers allows; sign-in is also rate limited per account and IP.
import { digest } from "./booking-security";

const ITERATIONS = 100_000;
export const PASSWORD_RULE = "Use at least 10 characters.";
export const validPassword = (password: string) => password.length >= 10 && password.length <= 200;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const peppered = new TextEncoder().encode(await digest(`admin-password:${password}`));
  const key = await crypto.subtle.importKey("raw", peppered, "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !salt || !hash) return false;
  const expected = unb64(hash), actual = await derive(password, unb64(salt), Number(iterations));
  let diff = expected.length ^ actual.length;
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) diff |= expected[i] ^ actual[i];
  return diff === 0; // Compared in constant time.
}
