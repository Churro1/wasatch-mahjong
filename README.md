# Wasatch Mahjong Web App

Next.js app for event discovery, booking, and account management for Wasatch Mahjong.

## Local Setup

1. Install dependencies.

```bash
npm install
```

1. Create local environment file from template.

```bash
cp .env.example .env.local
```

1. Fill in `.env.local` values.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (your deployed app URL, e.g. `https://your-app.onrender.com`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE` (`true` for implicit TLS, usually port 465; otherwise `false`)
- `EMAIL_FROM`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY` (optional for future client-side Stripe UI)
- `STRIPE_WEBHOOK_SECRET`
- `CONTACT_TO_EMAIL` (optional fallback target for contact form notifications)
- `WAITLIST_CRON_SECRET` (secret token for scheduled waitlist processing endpoint)

1. Start the development server from this folder (`wasatch_mahjong`).

```bash
npm run dev
```

## Security Notes

- Never commit `.env.local`.
- Keep all credentials in environment variables only.
- If any secret is exposed, rotate it immediately in the provider console.

## Email Delivery Notes

- The app sends email through SMTP using Nodemailer.
- Required SMTP environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`.
- Optional: `SMTP_SECURE=true` for implicit TLS (port 465). For STARTTLS (port 587), use `SMTP_SECURE=false`.
- Use the Admin dashboard "Email Test" button after deploy to confirm delivery.

## Stripe Checkout Setup

1. Create a Stripe account and copy your secret key into `.env.local` as `STRIPE_SECRET_KEY`.

1. Start a local webhook forwarder to the app.

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

1. Copy the webhook signing secret printed by Stripe into `.env.local` as `STRIPE_WEBHOOK_SECRET`.

1. In Supabase project settings, copy the service role key into `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`.

1. Apply the latest Supabase migration so event records can store Stripe product/price IDs.

```bash
supabase db push
```

1. Restart the Next.js dev server after changing env vars.

Hosted checkout creates or reuses Stripe Product/Price records per event, finalizes paid orders from the Stripe webhook, sends confirmation emails, and supports dashboard/admin cancellations with the $10 cancellation fee.

## Scripts

- `npm run dev`: Start local development server.
- `npm run build`: Create production build.
- `npm run start`: Start production server from build output.
- `npm run lint`: Run ESLint.

## Waitlist Automation

The waitlist feature sends a private 24-hour claim link when a spot opens.

- Endpoint: `POST /api/waitlist/process`
- Header required: `x-waitlist-secret: <WAITLIST_CRON_SECRET>`
- Schedule this endpoint periodically (for example every 15 minutes) so expired offers advance to the next person in line.

## Keep-Alive Ping

If you are using Render's free tier, set up a second cron-job.org job to ping the site periodically. This can help keep the service warm, but it is not a guarantee that Render will never sleep the app.

- URL: `https://www.wasatchmahjong.com/api/health`
- Method: `GET`
- Schedule: every 5 to 10 minutes
- Headers: none required

Use the health endpoint only for uptime/keep-alive checks. It does not touch Supabase, Stripe, or email systems.
