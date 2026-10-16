// Third-party endpoints. For local end-to-end tests only, TEST_PROVIDER_ORIGIN can
// point them at a fake running on loopback (http://127.0.0.1:PORT). Any other value,
// and any value on Vercel, is ignored, so production always uses the real services.
function testOrigin() {
  const value = process.env.TEST_PROVIDER_ORIGIN;
  // Also ignored unless the site itself runs on loopback, so a stray value on a
  // real deployment (Vercel or Cloudflare) can never redirect provider calls.
  const loopbackSite = /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(process.env.BOOKING_ORIGIN ?? "");
  return value && loopbackSite && process.env.VERCEL !== "1" && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(value) ? value : null;
}
export const testMode = () => testOrigin() !== null;
export const d1Api = () => `${testOrigin() ?? "https://api.cloudflare.com"}/client/v4`;
export const turnstileVerifyUrl = () => `${testOrigin() ?? "https://challenges.cloudflare.com"}/turnstile/v0/siteverify`;
export const resendEmailsUrl = () => `${testOrigin() ?? "https://api.resend.com"}/emails`;
export const googleTokenUrl = () => `${testOrigin() ?? "https://oauth2.googleapis.com"}/token`;
export const googleCalendarApi = () => `${testOrigin() ?? "https://www.googleapis.com"}/calendar/v3`;
