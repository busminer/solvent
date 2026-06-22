# Roadmap

SOLVENT today is a complete, runnable recovery loop on real Stripe test mode with live Hermes + Nemotron calls. Where it's headed:

- [ ] **Telegram approvals** — resolve the approval queue from a real chat (scaffold in `integrations/notify.js`).
- [ ] **Payment-plan tracking** — follow installments across months, not just the first.
- [ ] **Per-client memory** — learn which tone works for which payer over time.
- [ ] **Configurable policy UI** — edit escalation thresholds without touching code.
- [ ] **Webhook ingestion** — react to Stripe `invoice.*` events in real time instead of polling.
- [ ] **Multi-currency** — recover invoices in the account's native currency.
- [ ] **Audit log** — exportable record of every decision, screen verdict, and approval.
