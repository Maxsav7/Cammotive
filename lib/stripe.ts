// Stripe, for the booking deposit. Calls the REST API directly (no SDK) so it runs
// the same on Vercel and Cloudflare. Customers pay on Stripe's hosted Checkout
// page, so card details never touch this site.
import { stripeApi } from "./providers";

export function stripeReady() {
  return /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/.test(process.env.STRIPE_SECRET_KEY ?? "") && /^whsec_[A-Za-z0-9]{10,}$/.test(process.env.STRIPE_WEBHOOK_SECRET ?? "");
}

export type CheckoutSession = {
  id: string; url: string | null; status: "open" | "complete" | "expired"; payment_status: "paid" | "unpaid" | "no_payment_required";
  payment_intent: string | null; amount_total: number | null; client_reference_id: string | null; metadata?: Record<string, string>;
};

// Stripe expects form encoding with bracketed keys, e.g. line_items[0][quantity].
function form(params: Record<string, string | number>) {
  return new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
}

async function stripe(path: string, init: { method?: string; body?: Record<string, string | number>; idempotencyKey?: string } = {}) {
  const response = await fetch(`${stripeApi()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body ? form(init.body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Stripe request failed (${response.status})`); // No body: it can echo request data.
  return response.json();
}

export function createDepositCheckout(o: {
  code: string; email: string; amountCents: number; title: string; description: string;
  successUrl: string; cancelUrl: string; expiresAt: number;
}): Promise<CheckoutSession> {
  return stripe("/checkout/sessions", {
    method: "POST", idempotencyKey: `checkout-${o.code}`,
    body: {
      mode: "payment",
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": o.amountCents,
      "line_items[0][price_data][product_data][name]": o.title,
      "line_items[0][price_data][product_data][description]": o.description,
      customer_email: o.email,
      client_reference_id: o.code,
      "metadata[booking_code]": o.code,
      "payment_intent_data[metadata][booking_code]": o.code,
      "payment_intent_data[description]": `Camotive deposit ${o.code}`,
      "custom_text[submit][message]": "This deposit confirms your appointment and goes toward your total. It's non-refundable if you cancel.",
      success_url: o.successUrl,
      cancel_url: o.cancelUrl,
      expires_at: o.expiresAt,
    },
  });
}

export const getCheckout = (id: string): Promise<CheckoutSession> => stripe(`/checkout/sessions/${encodeURIComponent(id)}`);

// Ends an unpaid Checkout Session early so it can't be paid after its slot is gone.
export const expireCheckout = (id: string) => stripe(`/checkout/sessions/${encodeURIComponent(id)}/expire`, { method: "POST", body: {} });

export const refundDeposit = (paymentIntent: string, code: string) =>
  stripe("/refunds", { method: "POST", idempotencyKey: `refund-${code}`, body: { payment_intent: paymentIntent, "metadata[booking_code]": code } });

export const checkoutIdPattern = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

function hexToBytes(value: string) {
  return /^[a-f0-9]{64}$/.test(value) ? Uint8Array.from(value.match(/../g)!, b => parseInt(b, 16)) : null;
}

// Verifies the Stripe-Signature header: HMAC-SHA256 of "<t>.<raw body>" with the
// endpoint secret, any v1 signature may match, and the timestamp must be recent
// (5 minutes) so a captured request can't be replayed later.
export async function verifyWebhook(rawBody: string, header: string | null, now = Math.floor(Date.now() / 1000)) {
  if (!header || header.length > 2048) return false;
  const parts = header.split(",").map(p => p.split("=", 2) as [string, string]);
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.STRIPE_WEBHOOK_SECRET!), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${timestamp}.${rawBody}`);
  for (const [k, v] of parts) {
    const signature = k === "v1" ? hexToBytes(v) : null;
    // crypto.subtle.verify compares in constant time.
    if (signature && await crypto.subtle.verify("HMAC", key, signature, signed)) return true;
  }
  return false;
}
