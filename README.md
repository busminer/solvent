<div align="center">

# SOLVENT

**The agentic receivables operator for Stripe.**
Recover the revenue you've already earned — by gently reminding, not aggressively collecting.

[![Node](https://img.shields.io/badge/Node-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Hermes Hackathon](https://img.shields.io/badge/Hermes%20Agent-Hackathon-9D7BFF)](https://hermesco.ai)
![Hermes](https://img.shields.io/badge/Nous-Hermes_4-9D7BFF)
![Nemotron](https://img.shields.io/badge/NVIDIA-Nemotron_Content_Safety-76B900?logo=nvidia&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-test_mode-635BFF?logo=stripe&logoColor=white)
[![Stars](https://img.shields.io/github/stars/busminer/solvent?style=social)](https://github.com/busminer/solvent)

</div>

> **Thesis: `unpaid ≠ unwilling`.** Most invoices aren't refused — they're forgotten. A buried email, an expired card, a stalled approval. SOLVENT is a *gentle initiator*: soft by default, firm only when justified, and **every irreversible step waits for a human tap.**

---

## What it does

SOLVENT turns overdue Stripe invoices into managed recovery cases. For each unpaid invoice it:

1. **Reads** the case (amount, age, history, friction cause) and **decides** the softest stage that could work — using **Nous Hermes**.
2. **Drafts** the message in the right tone, then **screens** that text with **NVIDIA Nemotron Content Safety** (tighten-only).
3. **Settles** payment through **Stripe** (real hosted invoice links, test mode).
4. Tracks recovered revenue against the agent's own cost — a single, honest **Net Recovered** number.

Gentle reminders auto-send. Anything irreversible — firmer tones, payment plans, discounts, write-offs — **waits for human approval**. Hard caps (discount ceiling, write-off gating) are enforced in code and cannot be loosened by any model.

## The recovery loop

```
  ┌──────────┐   ┌──────────┐   ┌──────────────────┐   ┌──────────┐   ┌──────────┐
  │  STRIPE  │──▶│  HERMES  │──▶│  NEMOTRON        │──▶│  STRIPE  │──▶│ TREASURY │
  │  intake  │   │  decides │   │  content safety  │   │  settles │   │  net P&L │
  └──────────┘   └────┬─────┘   └────────┬─────────┘   └────┬─────┘   └──────────┘
                      │                  │                  │
                  reasoning          safe / unsafe      auto-send
                                      (tighten-only)         │
                                                             ▼
                                                  ┌─────────────────────┐
                                                  │   YOUR APPROVAL      │
                                                  │  every irreversible  │
                                                  │  step waits here     │
                                                  └─────────────────────┘
```

**Two-sided tighten-only:** the *decision* has a code-enforced floor (large/old invoices can never be softer than `firm`, so they always reach a human), and the *message* is screened by Nemotron (unsafe text is escalated, never auto-sent). Models may go stricter; they can never go softer than the code allows.

## Quickstart

```bash
# 1. install
npm install

# 2. configure (without keys it runs on mock data immediately)
cp .env.example .env
#    add STRIPE_SECRET_KEY (sk_test_/rk_test_), NOUS_API_KEY, NVIDIA_API_KEY

# 3. (real Stripe) create 5 test invoices, then run
node reset-seed.js
npm run demo -- --verbose      # cinematic run with live connection traces
```

| Command | What it does |
|---|---|
| `npm run demo` | Clean demo run (auto-approves risky items for recording) |
| `npm run demo -- --verbose` | Same, with live `[HERMES] [NEMOTRON] [STRIPE]` connection traces |
| `node llmcheck.js` | Preflight: confirm both model keys are live |
| `node reset-seed.js` | Create/refresh the 5 demo invoices in Stripe (test mode) |
| `node diag.js` | Inspect what's currently in your Stripe account |

Test card for hosted links: `4242 4242 4242 4242`.

## Architecture

```
src/
  index.js               entry point — runs the loop, prints the P&L
  config.js              settings + HARD CAPS (enforced in code)
  data/invoices.js       mock invoices (replaced by a Stripe pull in production)
  core/
    policy.js            the agent's "character": stages, rules, and the code floor
    safety.js            deterministic gate + Nemotron Content Safety screen (tighten-only)
    agent.js             orchestrator: reason → propose → screen → act/queue → settle
    ledger.js            the treasury (P&L)
    approvals.js         the approval queue (human in the loop)
  messages/templates.js  warm copy per stage (the agent's voice)
  integrations/
    llm.js               real Hermes + Nemotron calls (OpenAI-compatible)
    stripe.js            Stripe test-mode wrapper (mock fallback without a key)
    notify.js            notifications (console / Telegram)
  util/trace.js          verbose connection tracer (--verbose)
```

See [`docs/whitepaper.md`](./docs/whitepaper.md) and [`docs/architecture.md`](./docs/architecture.md) for the full design.

## Safety model

- **Gentle is auto; everything else is gated.** Firm reminders, payment plans, settlement offers, and write-offs require a human tap.
- **Hard caps live in code.** A discount above the cap is refused regardless of what any model returns.
- **Tighten-only, both sides.** The decision floor and the content-safety screen can only make an action stricter — never softer.
- **The agent knows when to stop.** Unresponsive, very-old cases are flagged for a human decision, not auto-pursued.

## Tech

Node.js · Stripe (test mode) · Nous Hermes (`Hermes-4-70B`) · NVIDIA Nemotron Content Safety (`llama-3.1-nemoguard-8b-content-safety`) · OpenAI-compatible HTTP.

---

<div align="center">

**Hermes** decides · **NVIDIA Nemotron** screens · **Stripe** settles · **the human** holds the line.

<sub>Built for the Hermes Agent Accelerated Business Hackathon (Nous Research × NVIDIA × Stripe).</sub>

</div>
