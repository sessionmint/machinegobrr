# machinegobrrr (SessionMint.fun)

Next.js app deployed via **Firebase App Hosting** for SessionMint.fun.

Routes:
- `/machinegobrrr` (MachineGoBrrr)
- `/kaching` (placeholder)
- `/` (placeholder)

## Mainnet Only

- Solana payments: `mainnet-beta`
- Helius webhooks: `mainnet`

## What It Does

- Phantom-only wallet connect (extension + mobile deeplink fallback)
- Pay to queue a token (SOL or MINSTR)
- Charts via DexScreener (synthetic 1m candle from live pair data)
- Realtime app state via SSE, persisted to Firestore
- Optional device sync + device alert forwarding

## Environment Variables

Local dev uses `.env.local`. Firebase App Hosting uses runtime env vars / secrets.

Public (bundled):
- `NEXT_PUBLIC_PHANTOM_APP_ID` (required)
- `NEXT_PUBLIC_APP_URL` (recommended for absolute URLs)
- `NEXT_PUBLIC_TREASURY_WALLET` (optional; defaults exist)
- `NEXT_PUBLIC_DEFAULT_TOKEN` (optional; defaults exist)
- `NEXT_PUBLIC_MINSTR_MINT` (optional; defaults exist)
- `NEXT_PUBLIC_HELIUS_API_KEY` (optional; improves RPC/WS access)
- `NEXT_PUBLIC_HELIUS_RPC_URL`, `NEXT_PUBLIC_HELIUS_WS_URL` (optional)
- `NEXT_PUBLIC_DEVICE_API_URL`, `NEXT_PUBLIC_DEVICE_API_KEY` (optional; only for device-alert forwarding)

Server-only:
- `FIREBASE_PROJECT_ID` (required)
- `ADMIN_API_KEY` (required; protects `/api/webhook/manage` and admin routes)
- `HELIUS_WEBHOOK_AUTH_TOKEN` (required in production; protects `/api/helius-webhook`)
- `HELIUS_API_KEY` (required if you want the app to create/update Helius webhooks)
- `CRON_SECRET` (recommended; for scheduled processing)
- `VERIFY_WEBHOOK_IP=true` (recommended; allowlist Helius webhook IPs)
- `AUTOBLOW_ENABLED`, `AUTOBLOW_DEVICE_TOKEN`, `AUTOBLOW_CLUSTER` (optional; device control)
- `STATE_SNAPSHOT_WRITE_DEBOUNCE_MS` (optional)
- `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` (optional local-dev fallback; prefer ADC in App Hosting)

See `.env.example` for a complete template.

## Phantom Portal Allowlist

Allowlist these redirect URLs in Phantom Portal (at minimum):
- `http://localhost:3000/machinegobrrr`
- `https://sessionmint.fun/machinegobrrr`

## Local Development

```bash
npm ci
npm run dev
```

## Deploy (Firebase App Hosting)

1. `firebase login`
2. `firebase use sessionmint-live`
3. One-time backend create (if needed): `firebase apphosting:backends:create machinegobrrr --project sessionmint-live --location us-central1`
4. Deploy: `firebase deploy --only apphosting:machinegobrrr --project sessionmint-live`
