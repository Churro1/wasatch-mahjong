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
- `GMAIL_USER`
- `GMAIL_PASS`
- `CONTACT_TO_EMAIL` (optional fallback target for contact form notifications)

1. Start the development server from this folder (`wasatch_mahjong`).

```bash
npm run dev
```

## Security Notes

- Never commit `.env.local`.
- Keep all credentials in environment variables only.
- If any secret is exposed, rotate it immediately in the provider console.

## Scripts

- `npm run dev`: Start local development server.
- `npm run build`: Create production build.
- `npm run start`: Start production server from build output.
- `npm run lint`: Run ESLint.
