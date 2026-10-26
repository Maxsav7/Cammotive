# Vercel deployment and booking setup

Production: https://www.camotivedetailing.com (also https://camotive.vercel.app; GitHub `Maxsav7/Cammotive`, branch `main`).
`vercel.json` selects the native Next.js build (`npm run build:vercel`) and a daily
cron for booking maintenance. Use Node 22.

Until every step below is done, the site works normally and the booking page
shows "call or text Camotive". That is the intended safe default.

## One-time setup

Read [SECURITY.md](./SECURITY.md) first. Do steps 1–7 on a **staging** setup
(separate D1 database, Turnstile widget and Resend key, your own inbox) before
production.

1. **Custom domain for email.** Resend only sends from a domain you have
   verified with DNS records, and `vercel.app` cannot be verified by you. Add your
   own domain in Resend: add `camotivedetailing.com`, add the SPF/DKIM records it
   gives you plus a DMARC record at your DNS provider, and set
   `BOOKING_FROM_EMAIL` to `Camotive Detailing <bookings@camotivedetailing.com>`.
   Set `BOOKING_ORIGIN` to `https://www.camotivedetailing.com` (the bare domain
   redirects there, so customers always land on `www`).
2. **Database.** In Cloudflare, create a D1 database. Then create the tables
   (safe to re-run):

   ```bash
   npx wrangler login
   npx wrangler d1 execute <your-database-name> --remote --file=drizzle/0000_booking_schema.sql
   npx wrangler d1 execute <your-database-name> --remote --file=drizzle/0001_stripe_deposits.sql
   ```

   If the database already exists, only the second command is needed (it adds
   the deposit and sign-in tables and is safe to re-run).

   Create an API token with **D1 Edit** permission for that account only. Set
   `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_D1_API_TOKEN`.
3. **Bot check.** Create a Cloudflare Turnstile widget for your exact hostname
   (`www.camotivedetailing.com`). Set `TURNSTILE_SITE_KEY` and
   `TURNSTILE_SECRET_KEY`.
4. **Secrets.** Run `openssl rand -hex 32` four times and set
   `BOOKING_ENCRYPTION_KEY`, `BOOKING_HASH_SECRET`, `BOOKING_CRON_SECRET` and
   `CRON_SECRET` (a different value each). Store the encryption key in your
   password manager too: losing it makes existing bookings unreadable.
5. **Remaining variables.** `BOOKING_ORIGIN` (exact https origin, no trailing
   slash), `RESEND_API_KEY`, `CAM_BOOKING_EMAIL`. See `.env.example`.
6. **Stripe (the $50 deposit).** Booking stays off until both keys are set.
   1. Create a [Stripe](https://dashboard.stripe.com/register) account in
      Camotive's name and finish activation (business details and the bank
      account deposits are paid out to).
   2. *Developers → API keys*: copy the **Secret key** (`sk_live_…`) into
      `STRIPE_SECRET_KEY`. A *restricted* key works too if it has write access
      to Checkout Sessions and Refunds.
   3. *Developers → Webhooks → Add endpoint*: URL
      `https://www.camotivedetailing.com/api/stripe/webhook`, events
      `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
      `checkout.session.async_payment_failed` and `checkout.session.expired`.
      Copy its **Signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
   4. For a dry run first, use test-mode keys (`sk_test_…`, and a test-mode
      webhook endpoint) on a Preview deployment and pay with card
      `4242 4242 4242 4242`. Switch to live keys for Production.
7. **Google Calendar (optional, recommended).** Adds every booking to Cam's
   Google Calendar, removes it if he cancels, and stops customers booking times
   he's already busy. Booking works without it; skip the three variables to
   leave it off.
   1. In [Google Cloud Console](https://console.cloud.google.com/), create a
      project and enable the **Google Calendar API**.
   2. Under *IAM & Admin → Service accounts*, create a service account (no
      roles needed). Open it, then *Keys → Add key → JSON*. Keep the file safe.
   3. In Google Calendar (as Cam), open the calendar's *Settings and sharing →
      Share with specific people*, add the service account's email and choose
      **Make changes to events**. Under *Integrate calendar*, copy the
      **Calendar ID** (for his main calendar it's his Gmail address).
   4. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL` (`client_email` from the JSON),
      `GOOGLE_SERVICE_ACCOUNT_KEY` (`private_key` from the JSON, the whole
      value from `BEGIN PRIVATE KEY` to `END PRIVATE KEY`; literal `\n` is fine) and
      `GOOGLE_CALENDAR_ID`.
8. **Test.** Set `BOOKING_SCHEDULER_READY=true` and `BOOKING_ENABLED=true`,
   redeploy, then (with Stripe test keys): add a test event to Cam's calendar
   and check that slot shows as taken; book a different slot, pay with
   `4242 4242 4242 4242`, and check the "Booked" email (with calendar invite)
   and Cam's "New booking" email arrive and the booking appears on his calendar;
   start another booking and press Back on Stripe's page, and check the time is
   free again; open My appointments, sign in with the emailed code, cancel, and
   check the deposit is *not* refunded in Stripe; book again, cancel from
   "View or cancel" in Cam's email, and check the deposit *is* refunded.

## How booking works

- Only detailing (Full, Premium, Maintenance) is booked online. Ceramic coating,
  paint correction, window tint and anything else go through `/quote`, which
  emails Cam and sends the customer an acknowledgement.
- Three appointment windows a day, every day: **8–11 AM, 12–3 PM and 4–8 PM**
  (Central time; we arrive at the start of the window), from
  tomorrow up to 90 days ahead. Change them in `lib/booking-catalog.ts`
  (`bookingTimes`, `slotStart`, `slotEnd`, `slotLabel`).
- The customer picks a detail, add-ons, an open time and their details, then
  pays a **$50 deposit** on Stripe's hosted Checkout page (card details never
  touch the site). The time is held for 30 minutes while they pay. Payment
  **confirms the booking**; going back from Stripe, or not paying in time,
  releases the time. The deposit goes toward the total; the rest is paid on
  the day. Change the amount in `lib/booking-catalog.ts` (`depositDollars`).
- Once paid, the customer gets a "Booked" email with a calendar invite (.ics)
  and a link to **My appointments** (`/appointment`). There, or by entering
  their email to get a 6-digit sign-in code, they see every booking made with
  that email and can cancel an upcoming one. **A customer cancellation keeps
  the deposit** (they agree to this before paying), and Cam gets a "Customer
  cancelled" email.
- Cam gets a "New booking" email with the same invite and a private link to
  `/manage`, where he can cancel; **Cam cancelling refunds the deposit**
  automatically, emails the customer (with an invite that cancels the
  original) and releases the slot. Keep Cam's emails private: the link is the key.
- Rare case: if a payment completes after its hold ran out and someone else
  booked that time, the deposit is refunded automatically and both are emailed.
- With Google Calendar set up, each booking is added to Cam's calendar and
  removed if cancelled, and any busy time on that calendar marks overlapping
  slots as taken. If Google can't be reached, availability uses the bookings
  alone and calendar changes are retried with the emails.
- Emails are branded HTML (logo from `/brand/camotive-email-logo.png` on
  `BOOKING_ORIGIN`) with a plain-text version alongside.
- The daily cron sends a reminder email the day before each confirmed detail.
- Booking details are kept (encrypted) for about a year after the appointment so
  customers can see their history; unpaid, abandoned bookings are deleted after
  two days.

## How emails and calendar changes are delivered

Both go through the same queue (`booking_outbox`), so they share the retries below.

1. Immediately after a booking (sent once the customer's response is returned).
2. Retried whenever someone opens a booking page.
3. Retried and cleaned up by Vercel Cron once a day (Hobby plans allow daily
   only). On Vercel Pro you can change the schedule in `vercel.json` to
   `*/5 * * * *`. On Hobby, for faster retries, add a free external scheduler
   (for example cron-job.org) that POSTs `https://<your-origin>/api/internal/booking-maintenance`
   every 5 minutes with header `Authorization: Bearer <BOOKING_CRON_SECRET>`.

Stripe retries its webhook if the site is briefly down, and the page customers
return to after paying also checks with Stripe directly, so a payment is never
missed. Check Stripe → Developers → Webhooks for failed deliveries.

Check Vercel logs for `booking_email_failed_count`, `booking_outbox_retry_required`,
`google_calendar_busy_check_failed` and `booking_operation_failed`.

## Changing the database

Edit `db/schema.ts`, run `npm run db:generate`, commit the new file in
`drizzle/`, and apply it with the `wrangler d1 execute` command above. CI fails
if the schema and `drizzle/` disagree.

## Before every deploy

`npm run typecheck`, `npm run test:security`, `npm test`, `npm run test:vercel`,
`npm run test:browser`, and `npm run test:e2e` (the whole booking flow against
local fakes of D1, Turnstile, Resend, Google Calendar and Stripe).
