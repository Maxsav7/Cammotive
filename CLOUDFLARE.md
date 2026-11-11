# Cloudflare Workers hosting (vinext)

The same code runs on Vercel (`npm run build:vercel`, Next.js) and on Cloudflare
Workers (`npm run build`, vinext). Vercel stays the production host until the
cutover below; nothing in this branch changes Vercel.

| | Vercel | Cloudflare Workers |
|---|---|---|
| Build | `next build --webpack` | `vinext build` → `dist/` |
| Database | D1 over the REST API (`CLOUDFLARE_D1_*`) | D1 binding `DB` (no API token) |
| Scheduled maintenance | Vercel Cron, daily | Cron trigger, every 15 minutes |
| Client IP for rate limits | `x-vercel-forwarded-for` | `cf-connecting-ip` |
| Config | `vercel.json`, Vercel env vars | `wrangler.jsonc`, `wrangler secret put` |

Both hosts can use the **same D1 database and the same secrets**, so either one
can read every booking. That is what makes rollback safe.

## Variables

Set in `wrangler.jsonc` (public, non-secret): `BOOKING_ORIGIN` (production
only), `BOOKING_FROM_EMAIL`.

Set as secrets, per environment (`npx wrangler secret put NAME`, add
`--env staging` for staging). Use the **same values as Vercel** for production:

| Secret | Notes |
|---|---|
| `BOOKING_ENABLED`, `BOOKING_SCHEDULER_READY` | `true` to turn booking on |
| `BOOKING_ENCRYPTION_KEY` | Must match Vercel's, or existing bookings can't be read |
| `BOOKING_HASH_SECRET` | Must match Vercel's, or emailed links stop working |
| `BOOKING_CRON_SECRET` | Used by the cron trigger to call maintenance |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Add the Worker hostnames to the Turnstile widget |
| `RESEND_API_KEY` (or `BREVO_API_KEY` once the Brevo change is merged) | Email |
| `CAM_BOOKING_EMAIL` | Secret because this repository is public |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_CALENDAR_ID` | Optional calendar sync |
| `BOOKING_ORIGIN` (staging only) | The staging `https://camotive-staging.<subdomain>.workers.dev` URL |

Not used on Cloudflare: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`,
`CLOUDFLARE_D1_API_TOKEN`, `CRON_SECRET`.

## Staging (own URL, own database)

```bash
npx wrangler login
npx wrangler d1 create camotive-bookings-staging        # copy the id into env.staging in wrangler.jsonc
npx wrangler d1 execute camotive-bookings-staging --remote --file drizzle/0000_booking_schema.sql
npm run deploy:cloudflare:staging                        # prints https://camotive-staging.<subdomain>.workers.dev
```

The site works immediately with booking off ("call or text"). To test booking
on staging, set the secrets above with `--env staging` (staging Turnstile
hostname, your own inbox as `CAM_BOOKING_EMAIL`), then redeploy.

## Production database

If a production D1 database already exists, put its id in the top-level
`d1_databases` entry (`npx wrangler d1 list`); the Worker binds to it directly
and no data is copied or changed. Otherwise create it:

```bash
npx wrangler d1 create camotive-bookings
npx wrangler d1 execute camotive-bookings --remote --file drizzle/0000_booking_schema.sql
```

The schema file only creates what is missing (`IF NOT EXISTS`), so running it
against an existing database doesn't change its data.

## Production cutover

1. **Record the current DNS.** Cloudflare → camotivedetailing.com → DNS →
   Records: screenshot or export the `@` and `www` records (today they point at
   Vercel). You need them to roll back.
2. **Deploy the Worker without a domain.** Set the production secrets, then
   `npm run deploy:cloudflare:production`. With no route or custom domain it
   isn't reachable yet, so nothing changes for visitors.
3. **Turnstile:** add `www.camotivedetailing.com` to the widget's hostnames (it
   is probably already there for Vercel).
4. **Attach the domain** (this is the switch): Workers & Pages → `camotive` →
   Settings → Domains & Routes → Add → Custom domain → `www.camotivedetailing.com`,
   then again for `camotivedetailing.com` (the Worker redirects it to `www`).
   If Cloudflare reports that a DNS record already exists for that name,
   delete that record (you saved it in step 1) and add the custom domain again.
   HTTPS certificates are issued automatically, usually within minutes.
5. **Check:** open https://www.camotivedetailing.com and
   https://camotivedetailing.com (should redirect), book a test slot, cancel it
   from the "View or cancel" email, and watch Workers → `camotive` → Logs and
   Metrics (errors, CPU time).
6. **Stop Vercel's cron** so only one scheduler runs: remove the `crons` entry
   from `vercel.json` (or leave it: outbox leases stop double sending). Keep the
   Vercel project and its domains; don't delete anything until you're confident.

## Rollback (minutes)

1. Workers → `camotive` → Settings → Domains & Routes: remove both custom domains.
2. Cloudflare DNS: recreate the `@` and `www` records saved in step 1 of the
   cutover (DNS only, grey cloud, as Vercel expects).
3. Vercel serves the site again as soon as DNS updates. For booking to keep
   working there, Vercel needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`,
   `CLOUDFLARE_D1_API_TOKEN` (pointing at the same D1 database) and the same
   secrets as the Worker, so bookings made on Cloudflare are still there.

## Tests

`npm run test:cloudflare` builds the Worker and runs the browser suite and the
booking end-to-end suite against it under workerd (`wrangler dev`) with a local
D1 database created from `drizzle/`. Third-party services are loopback fakes.
