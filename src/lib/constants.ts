// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================

// Your wallet address that receives payments (MAINNET)
export const TREASURY_WALLET =
  process.env.NEXT_PUBLIC_TREASURY_WALLET ||
  "4st6sXyHiTPpgp42egiz1r6WEEBLMcKYL5cpncwnEReg";

// Phantom Connect SDK app id (from Phantom Portal)
export const PHANTOM_APP_ID = process.env.NEXT_PUBLIC_PHANTOM_APP_ID || "";

// Default token to display when queue is empty
export const DEFAULT_TOKEN_MINT =
  process.env.NEXT_PUBLIC_DEFAULT_TOKEN ||
  "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn";

// Your livestream embed URL
// YouTube: https://www.youtube.com/embed/VIDEO_ID
// Twitch: https://player.twitch.tv/?channel=CHANNEL_NAME&parent=localhost
// Kick: https://player.kick.com/CHANNEL_NAME
export const LIVESTREAM_URL = "https://player.kick.com/sessionmint";

// ============================================
// PRICING CONFIGURATION
// ============================================

// SOL payment tiers
export const SOL_STANDARD_PRICE = 0.01;
export const SOL_PRIORITY_PRICE = 0.04;

// MINSTR SPL token payment tiers
export const MINSTR_MINT =
  process.env.NEXT_PUBLIC_MINSTR_MINT ||
  "2gWujYmBCd77Sf9gg6yMSexdPrudKpvss1yV8E71pump";
export const MINSTR_STANDARD_PRICE = 10_000;
export const MINSTR_PRIORITY_PRICE = 42_000;
export const MINSTR_SYMBOL = "MINSTR";

// Backwards-compatible names used in queue/UI code
export const STANDARD_PRICE = SOL_STANDARD_PRICE;
export const PRIORITY_PRICE = SOL_PRIORITY_PRICE;

// Display durations in milliseconds
export const DISPLAY_DURATION_STANDARD = 10 * 60 * 1000; // 10 minutes
export const DISPLAY_DURATION_PRIORITY = 10 * 60 * 1000; // 10 minutes

// Duplicate address cooldown (2 hours)
export const DUPLICATE_COOLDOWN_MS = 2 * 60 * 60 * 1000;

// Priority levels (higher = more priority)
export const PRIORITY_LEVELS = {
  STANDARD: 0,
  PRIORITY: 1,
} as const;

export type PriorityLevel = typeof PRIORITY_LEVELS[keyof typeof PRIORITY_LEVELS];

// ============================================
// HELIUS CONFIGURATION
// ============================================

// Server-side only Helius API key for webhook management (MAINNET)
// This should NOT be exposed to the client - use HELIUS_API_KEY env var
export const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";

// Client-side Helius API key (MAINNET for payments)
export const HELIUS_CLIENT_API_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY || "";

// ============================================
// NETWORK CONFIGURATION
// ============================================

// PAYMENTS & WEBHOOKS: Both on MAINNET now
export const PAYMENT_NETWORK = "mainnet-beta";
const DEFAULT_MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";
const DEFAULT_MAINNET_WS_URL = "wss://api.mainnet-beta.solana.com";

const configuredRpcUrl = process.env.NEXT_PUBLIC_HELIUS_RPC_URL || "";
const configuredWsUrl = process.env.NEXT_PUBLIC_HELIUS_WS_URL || "";
const heliusRpcWithKey = HELIUS_CLIENT_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_CLIENT_API_KEY}`
  : "";
const heliusWsWithKey = HELIUS_CLIENT_API_KEY
  ? `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_CLIENT_API_KEY}`
  : "";

const configuredRpcNeedsKey =
  configuredRpcUrl.includes("helius-rpc.com") &&
  !configuredRpcUrl.includes("api-key=");
const configuredWsNeedsKey =
  configuredWsUrl.includes("helius-rpc.com") &&
  !configuredWsUrl.includes("api-key=");

export const HELIUS_RPC_URL = configuredRpcUrl
  ? configuredRpcNeedsKey
    ? HELIUS_CLIENT_API_KEY
      ? `${configuredRpcUrl}${configuredRpcUrl.includes("?") ? "&" : "?"}api-key=${HELIUS_CLIENT_API_KEY}`
      : DEFAULT_MAINNET_RPC_URL
    : configuredRpcUrl
  : heliusRpcWithKey || DEFAULT_MAINNET_RPC_URL;

export const HELIUS_WS_URL = configuredWsUrl
  ? configuredWsNeedsKey
    ? HELIUS_CLIENT_API_KEY
      ? `${configuredWsUrl}${configuredWsUrl.includes("?") ? "&" : "?"}api-key=${HELIUS_CLIENT_API_KEY}`
      : DEFAULT_MAINNET_WS_URL
    : configuredWsUrl
  : heliusWsWithKey || DEFAULT_MAINNET_WS_URL;

// WEBHOOKS: MAINNET - for real token trade monitoring
export const WEBHOOK_NETWORK = "mainnet";
export const HELIUS_MAINNET_API = "https://api.helius.xyz/v0";

// Helius webhook authorization token for verifying incoming webhooks
// Set this to match the auth header you configured in your Helius webhook dashboard
export const HELIUS_WEBHOOK_AUTH_TOKEN = process.env.HELIUS_WEBHOOK_AUTH_TOKEN || "";

// ============================================
// HELIUS WEBHOOK IP ALLOWLIST
// These are Helius's known webhook source IPs
// Verify with: https://docs.helius.dev/webhooks/ip-addresses
// ============================================
export const HELIUS_WEBHOOK_IPS = [
  // Helius webhook IPs - update these from Helius documentation
  "3.17.207.79",
  "3.17.39.238",
  "3.131.147.130",
  "3.140.66.241",
  "3.145.122.186",
  "3.145.98.200",
  "18.117.142.244",
  "18.117.209.248",
  "18.117.219.240",
  "18.117.97.49",
  "18.118.15.227",
  "18.119.17.122",
  "18.188.50.195",
  "18.189.100.51",
  "18.189.12.112",
  "18.189.57.84",
  "18.220.82.165",
  "18.221.148.32",
  "18.222.109.244",
  "18.223.144.50",
  "3.16.53.172",
  "18.223.112.194",
];

// ============================================
// DEVICE API CONFIGURATION
// ============================================

export const DEVICE_API_URL = process.env.NEXT_PUBLIC_DEVICE_API_URL || "";
export const DEVICE_API_KEY = process.env.NEXT_PUBLIC_DEVICE_API_KEY || "";
export const AUTOBLOW_ENABLED = process.env.AUTOBLOW_ENABLED === "true";

// ============================================
// SECURITY CONFIGURATION
// ============================================

// Admin API key for protected endpoints (webhook management, queue processing)
// Generate a secure random string and set in environment
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";

// Cloud Scheduler secret for queue processing
export const CRON_SECRET = process.env.CRON_SECRET || "";

// Enable IP verification for webhooks (recommended for production)
export const VERIFY_WEBHOOK_IP = process.env.VERIFY_WEBHOOK_IP === "true";

// Rate limiting configuration
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
export const RATE_LIMIT_MAX_REQUESTS = 100; // max requests per window
