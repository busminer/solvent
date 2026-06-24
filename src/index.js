// src/index.js — entry point. Runs the full recovery loop and prints the P&L.
//
// Usage:
//   node src/index.js            normal run (approvals resolved in order)
//   node src/index.js --demo     demo mode: auto-approve everything risky, for recording
//   add --verbose                show live connection traces (Hermes / Nemotron / Stripe)
//
const Ledger = require('./core/ledger');
const ApprovalQueue = require('./core/approvals');
const agent = require('./core/agent');
const stripeApi = require('./integrations/stripe');
const { notify } = require('./integrations/notify');
const tg = require('./integrations/telegram');
const { VERBOSE, host } = require('./util/trace');
const { nous, nvidia, useHermes, useNemotron, useRealStripe } = require('./config');

const DEMO = process.argv.includes('--demo');
const TG = process.argv.includes('--tg') || process.argv.includes('--telegram');

// simple colored console log
const COLORS = { STRIPE: '\x1b[35m', RISK: '\x1b[33m', AGENT: '\x1b[36m', HERMES: '\x1b[95m', NEMOTRON: '\x1b[92m', POLICY: '\x1b[33m', HUMAN: '\x1b[32m', PAID: '\x1b[32m', LEDGER: '\x1b[90m' };
function log(tag, txt) {
  const c = COLORS[tag] || '';
  console.log(`${c}[${tag}]\x1b[0m ${txt}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('\n\x1b[1m  SOLVENT — agentic receivables operator\x1b[0m');
  console.log('  ' + (stripeApi.isReal ? 'Stripe: REAL test mode' : 'Stripe: mock data (set STRIPE_SECRET_KEY in .env for test mode)') + '\n');

  if (VERBOSE) {
    const dim = '\x1b[90m', rst = '\x1b[0m';
    console.log(`  ${dim}── live wiring ───────────────────────────────${rst}`);
    console.log(`  \x1b[95m[HERMES]${rst}   ${useHermes ? host(nous.baseUrl) + '  · ' + nous.model : 'no key → fallback to rules'}`);
    console.log(`  \x1b[92m[NEMOTRON]${rst} ${useNemotron ? host(nvidia.baseUrl) + '  · ' + nvidia.model : 'no key → deterministic gate only'}`);
    console.log(`  \x1b[35m[STRIPE]${rst}   ${useRealStripe ? 'api.stripe.com  · test mode' : 'mock data'}`);
    console.log(`  ${dim}──────────────────────────────────────────────${rst}\n`);
  }

  const ledger = new Ledger();
  const approvals = new ApprovalQueue(notify);
  const ctx = { ledger, approvals, log };

  const invoices = await stripeApi.listOverdueInvoices();
  ledger.setTotal(invoices.length);
  const outstanding = invoices.reduce((s, i) => s + i.amount, 0);
  log('STRIPE', `Found ${invoices.length} overdue invoices ($${outstanding} outstanding)`);
  console.log('');

  // 1) agent processes each invoice (never performs an irreversible action by itself)
  for (const inv of invoices) {
    await agent.processInvoice(inv, ctx);
    await sleep(DEMO ? 700 : 150);
  }

  // 2) approval queue — the human in the loop
  console.log('');
  if (approvals.pending() === 0) {
    log('HUMAN', 'Approval queue is empty.');
  } else if (TG && tg.enabled) {
    // Live Telegram approvals: each irreversible action waits for a real tap.
    await tg.init();
    log('HUMAN', `Pending approvals: ${approvals.pending()}. Sent to Telegram — tap to decide.`);
    for (const item of approvals.list()) {
      log('HUMAN', `→ Telegram: ${item.label} — waiting for your tap…`);
      await tg.sendApproval(item);
      const tap = await tg.waitForDecision(item);
      const approveIt = tap === true; // timeout or Hold → not approved
      const resolved = approvals.resolve(item.id, approveIt);
      if (approveIt) {
        log('HUMAN', `Approved in Telegram: ${resolved.label}`);
        await agent.executeApproved(resolved, ctx);
      } else {
        log('HUMAN', `${tap === null ? 'No tap (timed out)' : 'Held'} — left for human: ${resolved.label}`);
      }
      await sleep(300);
    }
  } else {
    log('HUMAN', `Pending approvals: ${approvals.pending()}. ${DEMO ? 'Demo mode: auto-approve.' : 'Resolving in order.'}`);
    for (const item of approvals.list()) {
      // In production this waits for a human tap in Telegram. In this build:
      //  --demo  -> approve everything except explicit escalation/write-off (left for the human)
      //  else    -> approve everything except escalation (a sane default)
      const approveIt = item.action !== 'escalation';
      const resolved = approvals.resolve(item.id, approveIt);
      if (approveIt) {
        log('HUMAN', `Approved: ${resolved.label}`);
        await agent.executeApproved(resolved, ctx);
      } else {
        log('HUMAN', `Left for human (not auto): ${resolved.label}`);
      }
      await sleep(DEMO ? 700 : 150);
    }
  }

  // 3) summary
  const s = ledger.summary();
  console.log('\n\x1b[1m  ── Recovery Treasury ─────────────────────────\x1b[0m');
  console.log(`  Recovered      $${s.recovered}`);
  console.log(`  Agent cost     -$${s.agentCost}`);
  console.log(`  \x1b[32mNet recovered  $${s.netRecovered}\x1b[0m`);
  console.log(`  Cases resolved ${s.resolved}`);
  if (s.roi) console.log(`  Recovery ROI   ${s.roi}× return on agent cost`);
  console.log('  Every irreversible action was human-approved.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
