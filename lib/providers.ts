// Third-party endpoints. For local end-to-end tests only, TEST_PROVIDER_ORIGIN can
// point them at a fake running on loopback (http://127.0.0.1:PORT). Any other value,
// and any value on Vercel, is ignored, so production always uses the real services.
function testOrigin() {
  const value = process.env.TEST_PROVIDER_ORIGIN;
  return value && process.env.VERCEL !== "1" && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(value) ? value : null;
}
export const testMode = () => testOrigin() !== null;
export const d1Api = () => `${testOrigin() ?? "https://api.cloudflare.com"}/client/v4`;
export const turnstileVerifyUrl = () => `${testOrigin() ?? "https://challenges.cloudflare.com"}/turnstile/v0/siteverify`;
export const resendEmailsUrl = () => `${testOrigin() ?? "https://api.resend.com"}/emails`;
