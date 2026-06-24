// config.js — settings and hard caps for SOLVENT.
// dotenv is loaded softly: if `npm install` hasn't run yet, the project still starts on mock data.
try { require('dotenv').config(); } catch (_) { /* dotenv not installed yet — fine, read process.env as-is */ }

module.exports = {
  // No key → run on mock data (data/invoices.js). With a key → real Stripe test mode.
  stripeKey: process.env.STRIPE_SECRET_KEY || null,
  useRealStripe: Boolean(process.env.STRIPE_SECRET_KEY),

  // ── Nous Hermes (stage decision + message) — OpenAI-compatible endpoint ──
  nous: {
    apiKey: process.env.NOUS_API_KEY || null,
    baseUrl: process.env.NOUS_BASE_URL || 'https://inference-api.nousresearch.com/v1',
    model: process.env.NOUS_MODEL || 'Hermes-4-70B',
  },
  // ── NVIDIA Nemotron Content Safety (screens the message text) ──
  nvidia: {
    apiKey: process.env.NVIDIA_API_KEY || null,
    baseUrl: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    model: process.env.NVIDIA_MODEL || 'nvidia/llama-3.1-nemoguard-8b-content-safety',
  },
  useHermes: Boolean(process.env.NOUS_API_KEY),
  useNemotron: Boolean(process.env.NVIDIA_API_KEY),

  // ── HARD CAPS (enforced in code) ──────────────────────────────
  // The model/agent can make a decision STRICTER, but can never physically loosen this.
  caps: {
    discount: Number(process.env.DISCOUNT_CAP || 0.15), // max 15% discount; above this is blocked in code
  },

  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || null,
    chatId: process.env.TELEGRAM_CHAT_ID || null,
  },

  // Cost of one agent reasoning pass (mock). In production this is the actual model spend.
  agentCostPerAction: () => Math.round((0.45 + Math.random() * 0.9) * 100) / 100,
};
