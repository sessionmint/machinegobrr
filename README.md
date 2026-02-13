# SessionMint.fun

SessionMint.fun hosts multiple path-based apps in one Next.js + TypeScript codebase:

- `/` -> SessionMint homepage placeholder (replace with final homepage later)
- `/machinegobrrr` -> MachineGoBrrr app
- `/kaching` -> KaChing placeholder page

## Stack

- Next.js App Router
- TypeScript
- Solana web3.js
- Firebase (client + Admin SDK)
- Phantom Connect SDK only (`@phantom/browser-sdk` from `phantom/phantom-connect-sdk`)

## Wallet Policy

MachineGoBrrr is Phantom-only by design.

- No `@solana/wallet-adapter-*`
- No Wallet Standard connectors
- No other wallets
- UI exposes one connect flow: **Connect Phantom**

## Phantom Portal Configuration

In Phantom Portal, allowlist:

- `https://sessionmint.fun` (production origin)
- `http://localhost:3000` (local development)

`NEXT_PUBLIC_PHANTOM_APP_ID` must be set in environment variables.

## Treasury Wallet

Single source of truth:

- `NEXT_PUBLIC_TREASURY_WALLET`
- Fallback default: `4st6sXyHiTPpgp42egiz1r6WEEBLMcKYL5cpncwnEReg`

## MachineGoBrrr Defaults

- Kick channel: `https://kick.com/sessionmint` (embed: `https://player.kick.com/sessionmint`)
- Default chart token: `$PUMP` mint `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn`

## Payment Tiers

- `Standard`: `0.01 SOL` or `10,000 MINSTR`
- `Priority`: `0.04 SOL` or `42,000 MINSTR`
- MINSTR SPL mint: `2gWujYmBCd77Sf9gg6yMSexdPrudKpvss1yV8E71pump`
- Users always pay Solana gas fees in SOL, including MINSTR transfers.

## Realtime State Model

Client polling loops were replaced with SSE:

- `GET /api/state` -> cached snapshot (`Cache-Control: max-age=1`)
- `GET /api/state/stream` -> Server-Sent Events stream

Server state behavior:

- Single authoritative snapshot in memory
- Debounced persistence to Firestore (`STATE_SNAPSHOT_WRITE_DEBOUNCE_MS`, clamped 500-2000ms)
- Mutation routes refresh and broadcast state updates
- Queue/device transitions are processed server-side (not per-client)

## Rate Limiting

In-memory rate limits are enforced on high-volume POST routes:

- Per-IP limits on queue/device/cooldown actions
- Per-wallet limit on queue add operations

## Environment Setup

Copy and fill:

```bash
cp .env.example .env
```

Key values:

- `NEXT_PUBLIC_PHANTOM_APP_ID`
- `NEXT_PUBLIC_TREASURY_WALLET`
- `NEXT_PUBLIC_DEFAULT_TOKEN`
- `NEXT_PUBLIC_MINSTR_MINT`
- Firebase client + Admin credentials
- Helius keys
- `ADMIN_API_KEY` and `CRON_SECRET`

## Deployment

This project is intended for **Firebase App Hosting** deployment.

- App Hosting runs the Next.js app on Cloud Run for you.
- Runbook: `docs/google-cloud-deployment.md`

## UX Notes

- Mobile-only blocking logic is intentionally removed.
