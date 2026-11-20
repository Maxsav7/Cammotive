// Headers on every response.
export const securityHeaders = {
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()", "Strict-Transport-Security": "max-age=31536000",
};

// For responses that aren't pages (API answers, files): nothing in them runs.
export const baseContentSecurityPolicy = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

// Pages: only scripts carrying this request's nonce run, plus whatever they load
// themselves ('strict-dynamic': the Turnstile script, which the booking form adds).
// An injected <script> or inline event handler has no nonce, so it doesn't run.
// The Turnstile host stays listed for older browsers without 'strict-dynamic'.
// Inline styles are allowed (React style props, the Turnstile widget); they can't run code.
export function pageContentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// 128 random bits, new for every page request.
export function newNonce() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}
