# Contributing

SOLVENT is a small, readable codebase by design. The loop is intentionally one screen of orchestration (`src/core/agent.js`), with each responsibility in its own module.

## Local setup

```bash
npm install
cp .env.example .env   # add keys, or leave blank to run on mock data
npm run demo
```

## Where things live

- **Decision logic / the agent's character** → `src/core/policy.js`
- **Safety gate + content-safety screen** → `src/core/safety.js`
- **Model calls (Hermes, Nemotron)** → `src/integrations/llm.js`
- **Stripe** → `src/integrations/stripe.js`
- **Message copy** → `src/messages/templates.js`

## Principles

1. The agent never performs an irreversible action on its own. It prepares and queues; a human approves.
2. Hard caps live in code, not in prompts. Models may tighten, never loosen.
3. Keep the loop legible: one orchestrator, small modules, clear logs.
