# Vercel deployment and booking setup

Production: https://camotive.vercel.app (GitHub `Maxsav7/Cammotive`, branch `main`).
`vercel.json` selects the native Next.js build (`npm run build:vercel`) and a daily
cron for booking maintenance. Use Node 22.

Until every step below is done, the site works normally and the booking page
shows "call or text Camotive". That is the intended safe default.

## One-time setup

Read [SECURITY.md](./SECURITY.md) first. Do steps 1–6 on a **staging** setup
(separate D1 database, Turnstile widget and Resend key, your own inbox) before
production.

1. **Custom domain for email.** Resend only sends from a domain you have
   verified with DNS records, and `vercel.app` cannot be verified by you. Add your
   own domain (for example `camotivedetailing.com`) in Resend, add the SPF/DKIM
   records it gives you plus a DMARC record, and set `BOOKING_FROM_EMAIL` to an
   address on it. Ideally point the same domain at Vercel and use it as
   `BOOKING_ORIGIN`.
2. **Database.** In Cloudflare, create a D1 database. Then create the tables
   (safe to re-run):

   ```bash
   npx wrangler login
   npx wrangler d1 execute <your-database-name> --remote --file=drizzle/0000_booking_schema.sql
   ```

   Create an API token with **D1 Edit** permission for that account only. Set
   `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_D1_API_TOKEN`.
3. **Bot check.** Create a Cloudflare Turnstile widget for your exact hostname
   (`camotive.vercel.app` or your custom domain). Set `TURNSTILE_SITE_KEY` and
   `TURNSTILE_SECRET_KEY`.
4. **Secrets.** Run `openssl rand -hex 32` four times and set
   `BOOKING_ENCRYPTION_KEY`, `BOOKING_HASH_SECRET`, `BOOKING_CRON_SECRET` and
   `CRON_SECRET` (a different value each). Store the encryption key in your
   password manager too: losing it makes existing bookings unreadable.
5. **Remaining variables.** `BOOKING_ORIGIN` (exact https origin, no trailing
   slash), `RESEND_API_KEY`, `CAM_BOOKING_EMAIL`. See `.env.example`.
6. **Test.** Set `BOOKING_SCHEDULER_READY=true` and `BOOKING_ENABLED=true`,
   redeploy, then: book a date, confirm both emails arrive, open the private
   link, request a replacement link, and confirm a second booking on the same
   date is refused.

## How emails are delivered

1. Immediately after a booking (sent once the customer's response is returned).
2. Retried whenever someone opens a booking page.
3. Retried and cleaned up by Vercel Cron once a day (Hobby plans allow daily
   only). On Vercel Pro you can change the schedule in `vercel.json` to
   `*/5 * * * *`. On Hobby, for faster retries, add a free external scheduler
   (for example cron-job.org) that POSTs `https://<your-origin>/api/internal/booking-maintenance`
   every 5 minutes with header `Authorization: Bearer <BOOKING_CRON_SECRET>`.

Check Vercel logs for `booking_email_failed_count` and `booking_operation_failed`.

## Changing the database

Edit `db/schema.ts`, run `npm run db:generate`, commit the new file in
`drizzle/`, and apply it with the `wrangler d1 execute` command above. CI fails
if the schema and `drizzle/` disagree.

## Before every deploy

`npm run typecheck`, `npm run test:security`, `npm test`, `npm run test:vercel`.
