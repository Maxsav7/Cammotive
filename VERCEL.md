# Vercel deployment

Import Maxsav7/Cammotive, branch main. The checked-in vercel.json selects the
Next.js build and .next output. Use Node 22. The original Cloudflare build remains
available through npm run build.

## Booking database

The Vercel server requires these server-side environment variables:

- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_D1_DATABASE_ID
- CLOUDFLARE_D1_API_TOKEN (an API token with D1 write access to the intended account)

Use a D1 database you control. The existing Sites-hosted database is not
automatically accessible from Vercel; its data is not migrated by this change.
The appointments table is created on first use. Without configuration, booking
and lookup return a clear 503 response rather than claiming an appointment was saved.

## Booking confirmations

Configure RESEND_API_KEY, BOOKING_FROM_EMAIL, CAM_BOOKING_EMAIL,
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, and CAM_BOOKING_PHONE
to enable the existing email/SMS confirmation delivery. Do not commit secrets.
Scheduled reminders and real-time slot conflict prevention are not implemented.

Validate locally with npm run build:vercel and npm test. Deploying the front end
does not by itself configure the database or notification providers.
