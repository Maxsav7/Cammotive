# Security operations

Do not enable online booking just because a deployment is Ready. By default the
API returns 503 and the UI shows the call/text alternative.

## Activation checklist (both runtimes)

1. Back up the intended D1 database. Apply every file in `drizzle/` in order
   (see VERCEL.md for the command). The SQL uses `IF NOT EXISTS`, so it is safe
   on a database that already has the legacy `appointments` table or the earlier
   hand-written schema; existing appointments are preserved. `db/schema.ts` is
   the single source of truth and CI fails if it drifts from `drizzle/`.
   The booking schema was regenerated for approval-based booking (two slots per
   day, pending/confirmed/declined). Apply it to a new D1 database. If a
   database was created from an earlier version and never took customer
   bookings, drop its `secure_bookings` table before applying, because
   `IF NOT EXISTS` won't replace the old one-booking-per-day table.
2. Set the variables below in the hosting secret manager, not in Git. Use
   different databases, keys, bot widgets and sender identities for previews.
   Never give a preview deployment production customer data or provider keys.
3. Configure Turnstile for the exact production hostname, with no localhost or
   wildcard allowance. The server verifies the hostname and action. Use a real
   production widget, not Cloudflare's always-pass testing keys.
4. Verify the Resend sending domain and owner mailbox. Set a provider spending
   limit/alert. This code permits at most 100 email attempts per UTC day;
   provider account caps must also be configured independently.
5. Emails are sent immediately after each booking (Next.js `after()`), and any
   that fail are retried whenever someone opens a booking page and by the
   maintenance endpoint `/api/internal/booking-maintenance`. Vercel Cron calls
   it daily (vercel.json) with `Authorization: Bearer <CRON_SECRET>`; Hobby
   plans allow daily cron only. For faster retries, also have an external
   scheduler POST it every few minutes with `Bearer <BOOKING_CRON_SECRET>`.
   Alert on missed runs, non-2xx responses or a nonzero `failed` count (also
   logged as `booking_email_failed_count`).
6. Test with your own mailbox: book, receive the "Booked" email, open Cam's
   "New booking" email, view by private link, request a replacement, retry the
   booking, cancel from Cam's link, and verify no duplicate appointment/email.
   Cam's `/manage` link grants view/cancel for that one booking; treat the
   `CAM_BOOKING_EMAIL` mailbox as an admin credential (use 2FA).
   Google Calendar sync (optional) uses a service account with access to Cam's
   calendar only through sharing; it can read free/busy and edit events on
   that calendar. Store its private key only in the hosting secret manager and
   rotate it in Google Cloud if exposed. Event descriptions contain the
   customer's name, phone, email and vehicle, so share that calendar with no one
   who shouldn't see them.
   Verify hosting headers and least-privilege credentials. Only then set
   `BOOKING_SCHEDULER_READY=true` and `BOOKING_ENABLED=true` for customers.

## Required environment

| Variable | Purpose |
|---|---|
| `BOOKING_ENABLED` | Explicit `true` activation; default disabled |
| `BOOKING_SCHEDULER_READY` | Explicit `true` acknowledgement that dispatcher is configured |
| `BOOKING_ORIGIN` | Exact canonical HTTPS origin, no trailing slash |
| `TURNSTILE_SITE_KEY` | Public site key (returned by status API) |
| `TURNSTILE_SECRET_KEY` | Server-only verification secret |
| `BOOKING_ENCRYPTION_KEY` | 32 random bytes, encoded as 64 hex characters |
| `BOOKING_HASH_SECRET` | Independent random secret, at least 32 characters |
| `BOOKING_CRON_SECRET` | Independent random secret, at least 32 characters (external scheduler) |
| `CRON_SECRET` | Independent random secret, at least 32 characters (Vercel Cron) |
| `RESEND_API_KEY` | Scoped sending credential |
| `BOOKING_FROM_EMAIL` | Verified sender |
| `CAM_BOOKING_EMAIL` | Owner notification mailbox |
| `STRIPE_SECRET_KEY` | Stripe secret (or restricted) key: Checkout Sessions and Refunds |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the `/api/stripe/webhook` endpoint |

### Payments and customer sign-in

- Customers pay on Stripe's hosted Checkout page; no card data reaches this
  site. The deposit amount is fixed on the server (`depositDollars`), never
  taken from the request.
- A booking is confirmed only by a Stripe-signed webhook (HMAC-SHA256 over the
  raw body, 5-minute timestamp tolerance, constant-time comparison) or by the
  server asking Stripe for the Checkout Session itself. Webhooks are idempotent.
- My appointments uses a one-time 6-digit code sent to the booking email (stored
  as a keyed hash, 15-minute expiry, 5 attempts, rate-limited per address and
  IP, identical responses whether or not the email has bookings), then a
  1-hour session token held only in the browser tab. The link in the
  confirmation email is a keyed hash of the booking code and signs in the same way.
- Customers can only see and cancel bookings made with their own email.

Vercel additionally requires `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_D1_API_TOKEN`. Use the narrowest
available D1 write scope in a dedicated account/database, not a Global API Key.
Cloudflare uses its native `DB` binding instead. Both require the schema above.

Generate each secret independently using a secure password manager or
`openssl rand -hex 32`. Do not paste generated secrets into chats or logs.
Changing the encryption key without re-encrypting stored rows makes those rows
unreadable. Plan rotation with a backup and migration; hash-key rotation revokes
links and affects recovery email hashes. Cron and provider keys can be rotated
independently with coordinated scheduler updates.

## Behavioral changes

- One appointment per day, enforced atomically, prevents overlapping mobile
  jobs until real duration/staffing rules are configured. Existing legacy
  appointments block the whole date too. Appointments are accepted from the
  next Chicago calendar day through approximately six months ahead, at the
  existing listed start times. Service-area suitability still requires owner
  review; the form does not geocode addresses.
- The server computes price from known service, size and add-on IDs. Submitted
  totals and unknown fields are rejected. Customer estimates may still change
  after vehicle-condition assessment.
- Short confirmation references are no longer access credentials. The API
  accepts a 256-bit token via Authorization, never via query parameters. Email
  links keep it in a fragment, which the UI removes immediately. No token is
  stored in localStorage. The token is a bearer secret, expires after 24 hours,
  and is revoked when a replacement is issued. Lookup omits address/email/phone.
- Legacy bookings remain in `appointments`; customers must call for help.
  No new endpoint exposes old records. Do not restore code-only lookup.
- Automatic SMS is disabled; unverified phone numbers are never sent messages.
  Adding SMS later requires separate verified-number/consent handling and caps.
  Scheduled reminders are not advertised or implemented.
- A booking is saved first, then its two emails are queued in one SQL
  statement. If queuing fails the booking is deleted and the customer sees an
  error, so a date is never held without anyone being told. This does not rely
  on D1 REST batches being transactional, which Cloudflare does not document.
- Emails use an encrypted transactional outbox. The dispatcher uses
  leases, a 10-second provider timeout, stable Resend idempotency keys, and up
  to five attempts within 23 hours (inside the provider's 24-hour dedup window).
  Delivery failure never rolls back an already saved booking. UI says queued,
  not delivered. Failed jobs need operator attention; automatic retries do not
  continue forever or past their deduplication deadline.
- Expired outbox payloads are erased; delivered payloads are erased immediately.
  New customer records are purged 90 days after the service date by maintenance.
  Legacy records are not automatically deleted: review/export them and apply
  your approved retention policy. Backups and provider email retention are
  separate obligations. No financial records/payment collection are implemented.

## Rate limits and edge controls

Counters are atomic in D1 and shared across instances. Creation is limited to
5 attempts/IP/hour, 3 bookings/email and phone/day, and 20 bookings/day globally.
Lookup is 30/IP/hour; replacement-link requests are 5/IP/hour, 3/email/day and
30/day globally. Fixed windows can burst at boundaries. Configure a platform
WAF/request-size/volumetric limit as well; app counters cannot absorb an upstream
denial-of-service flood for free.

The Vercel adapter trusts only `x-vercel-forwarded-for` when `VERCEL=1`;
Cloudflare uses `cf-connecting-ip` on its own ingress. Generic X-Forwarded-For is
ignored. Self-hosting behind a different proxy uses a single conservative
unknown-client bucket until an authenticated proxy adapter is implemented.
Do not expose a Worker origin bypassing its expected Cloudflare ingress.

## Headers and release checks

Both builds enforce anti-framing, nosniff, no-referrer, restricted permissions,
HSTS, and a basic CSP. A stricter script/style CSP is report-only pending a
compatible nonce strategy for Next/Vinext inline hydration. This is explicitly
not a complete enforced XSS policy; inspect browser violations before tightening.

Run `npm run test:security`, `npm test`, `npm run test:vercel`,
`npm run security:secrets`, and `npm audit --audit-level=high` before release.
The security suite executes real handlers against local workerd D1 through both
the binding and an intercepted REST adapter. No real messages or customer data
are used. Remote D1 transport and platform firewall settings still need staging
verification. Keep owner MFA, branch protection, secret scanning/push protection,
provider caps and backup restore checks enabled in their dashboards.

## Dependency gate

`npm run security:audit` (scripts/audit.mjs) runs in CI. Any high or critical
advisory in production dependencies fails the build. In the full tree, including
build and test tools, an advisory fails unless it is listed in the script with a
reason and a review-by date; an expired entry fails too.

October 2026: `sharp` (GHSA-wq5f-xc86-pv6w) and `source-map-js`
(GHSA-68fv-2mgg-jv7q) are resolved with `overrides` in package.json pinning the
patched 0.35.5 and 1.2.2. Next.js itself already shipped sharp 0.35.5; the old
copy was only inside Miniflare and vinext. Remove each override once the
packages that depend on it ship the patched version themselves.

Accepted until 2027-01-15: `braces` GHSA-vfj7-8cjw-p6xm. No patched release
exists. It is reached only through eslint-config-next and vinext's
vite-plugin-commonjs, neither of which runs on Vercel, and both only expand glob
patterns written in this repository. Recheck https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
before the review date.
