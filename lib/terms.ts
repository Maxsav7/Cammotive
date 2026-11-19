// The Terms of Service customers accept when booking (app/TermsOfService.tsx).
// Change TERMS_VERSION whenever the wording changes: each booking records the
// version the customer accepted and when, so a dispute can be checked against
// the exact terms they agreed to. Old versions are kept in git history.
export const TERMS_VERSION = "2026-11-18";
export const TERMS_EFFECTIVE = "November 18, 2026";
// How long booking records are kept after the appointment date (see the
// delete_after column set in app/api/appointments/route.ts).
export const RECORD_RETENTION_DAYS = 400;
