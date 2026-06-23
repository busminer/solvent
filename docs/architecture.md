# SOLVENT — Documentation

*The agentic receivables operator for Stripe invoices.*

Contents: Overview · Architecture · Recovery policy · Safety & approvals · Stripe (test mode) · Agent P&L

---

## Overview

SOLVENT turns overdue Stripe invoices into managed recovery cases. For each unpaid invoice it chooses a recovery strategy, drafts the right message in the right tone, settles payment through Stripe, and tracks recovered revenue against its own operating cost — while every irreversible step waits for human approval.

The guiding thesis is **unpaid is not unwilling**. Most invoices go unpaid because of friction — a forgotten email, an expired card, a stalled internal approval — not refusal. So the agent's default posture is the gentlest one that could work, and it escalates slowly and only with a human in the loop.

The pipeline ties the three foundations into one flow: **Hermes decides, NVIDIA Nemotron screens, Stripe settles — and the human holds the caps.**

---

## Architecture

SOLVENT is a small, complete loop. Five layers, one direction of flow.

```
overdue invoices ──► [1] DATA ──► [2] BRAIN ──► [3] SAFETY ──► [4] ACTION ──► [5] LEDGER
   (Stripe)          invoices.js   policy.js     safety.js      stripe.js      ledger.js
                                      │              │              │
                                      │              ▼              │
                                      │        approvals.js  ◄───── human tap
                                      └─────────── agent.js (orchestrator) ───────────┘
```

**1 · Data** — `data/invoices.js` / `integrations/stripe.js`
The receivables book: overdue invoices with amount, days overdue, history and friction cause. In test mode this is mock data; with a Stripe key it is pulled live from the account.

**2 · Brain** — `core/policy.js`
The decision layer and the agent's *character*. Given a case, it selects a recovery stage from a deliberate ladder. This is where real-world collections intuition lives as editable rules.

**3 · Safety** — `core/safety.js`
A deterministic gate first (what is allowed at all, plus hard caps), then an NVIDIA Nemotron Content Safety screen that classifies the action's risk against the policy. The gate then applies the stricter of the classifier's verdict and the hard caps — so the screen can tighten a decision but never loosen one.

**4 · Action** — `integrations/stripe.js` / `messages/templates.js`
Generates the message and a Stripe payment link. Soft actions execute; sensitive ones are routed to the approval queue.

**5 · Ledger** — `core/ledger.js`
The agent's treasury: recovered revenue, the agent's own operating cost, net recovered, and ROI.

The orchestrator `core/agent.js` runs the sequence for every case: reason → propose → screen → act or queue → settle.

---

## Recovery policy

Each case is placed on a five-stage ladder, starting soft. Lower rungs are the default and recover most of the money; upper rungs are exceptions and are gated.

| Stage | Name | Posture | Gate |
|------:|------|---------|------|
| 1 | Gentle reminder | Warm, low-pressure nudge + one-tap link | Auto |
| 2 | Firm reminder | Clear, with a deadline, still respectful | Human approval |
| 3 | Payment plan | Structured installments for strain / large balances | Human approval |
| 4 | Settlement offer | Small time-limited "settle today" discount | Human approval |
| 5 | Escalation | Pursue harder, or recognise as uncollectable | Human approval |

The stage is chosen from the amount, how overdue the invoice is, the customer's history, the friction cause, and a `neverPush` flag for relationships that must stay gentle. The thresholds live in one editable `RULES` block in `policy.js` — adjusting them changes the agent's personality without touching the rest of the system.

A worked example of the default logic: an expired card is treated as pure friction and gets a soft heads-up regardless of age; a large balance with a cash-flow signal is offered a payment plan rather than pressure; a long-unresponsive case is flagged for a human decision rather than handled autonomously.

---

## Safety & approvals

Trust is enforced in code, not promised in a prompt.

**The gate.** Soft actions (a gentle first reminder) clear automatically. Everything irreversible or relationship-sensitive — firm messaging, discounts, payment plans, write-offs, any external send — is held for a single human tap.

**Hard caps.** Limits such as the maximum discount are enforced in code. A proposed discount above the cap is refused outright, regardless of what any model decides. The human holds the caps and the caps are absolute.

**Tighten-only screening.** After the gate, an NVIDIA Nemotron Content Safety pass classifies the action as safe, needs-review, or blocked. The classifier can escalate an action to a stricter outcome, but loosening is impossible by construction: the gate keeps the stricter of the model's verdict and the code-enforced caps. Safety can only move in one direction.

**Human in the loop.** Pending actions queue up and surface to the operator (in production, as a tap in Telegram). Nothing irreversible happens without that tap.

---

## Stripe (test mode)

For demonstration, SOLVENT runs entirely in Stripe test mode — no real money moves and no account activation or KYC is required, so it works from anywhere.

- Create test invoices in the Stripe sandbox; these become the receivables book.
- Recovery uses Stripe hosted payment links against each invoice.
- Test payments use Stripe's test card `4242 4242 4242 4242`.
- Set `STRIPE_SECRET_KEY` (a `sk_test_…` key) in `.env` to switch from mock data to live test-mode invoices.

Moving to production is a key swap and uncommenting the live calls in `integrations/stripe.js`; the recovery logic is identical.

---

## Agent P&L

SOLVENT is a small autonomous economic unit: it earns and it spends, transparently.

- **Earns** — recovered invoice payments land on the ledger as revenue.
- **Spends** — each reasoning pass, message and risk screen has an inference cost the agent tracks and pays.
- **Manages its margin** — it does not burn expensive analysis on routine cases.

The ledger exposes a single legible result that proves the whole thesis:

> **Recovered $X · Agent cost $Y · Net recovered $Z · ROI N× · Every irreversible action human-approved.**

---

*Hermes by Nous Research · Nemotron by NVIDIA · Payments by Stripe.*
