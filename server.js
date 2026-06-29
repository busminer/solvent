// server.js — SOLVENT live command center.
//
// Boots a tiny HTTP server (no extra dependencies) that runs the REAL agent loop
// from ./src and streams every step to the browser over Server-Sent Events.
// Risky actions pause and wait for a click in the dashboard (Approve / Hold).
//
//   node server.js            → http://localhost:3000
//
// Without keys it runs on mock data. With keys in .env it goes live
// (Hermes decides, Nemotron screens, Stripe settles in test mode).

const http = require('http');
const fs = require('fs');
const path = require('path');

const Ledger = require('./src/core/ledger');
const ApprovalQueue = require('./src/core/approvals');
const agent = require('./src/core/agent');
const stripeApi = require('./src/integrations/stripe');
const llm = require('./src/integrations/llm');
const { prioritize } = require('./src/core/score');
const { useHermes, useNemotron } = require('./src/config');
const metrics = require('./src/util/metrics');

const PORT = process.env.PORT || 3000;
const DASHBOARD = path.join(__dirname, 'dashboard.html');

// ── live state (single-user demo, kept in memory) ───────────────────────────
const clients = new Set(); // open SSE responses
let session = null;        // { ledger, approvals, invoices, processed }
let running = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function broadcast(obj) {
  const line = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of clients) {
    try { res.write(line); } catch (_) { /* dropped client */ }
  }
}

function log(tag, text) {
  broadcast({ type: 'log', tag, text, ts: Date.now() });
  if (tag === 'HERMES' || tag === 'NEMOTRON' || tag === 'STRIPE') {
    const w = metrics.get(tag);
    if (w) broadcast({ type: 'wire', provider: tag, host: w.host, status: w.status, ms: w.ms });
  }
}

// Map an invoice (policy fields) into the inputs score.js expects, so the queue
// rings reflect the same friction/history the agent reasons about.
function toScoreInput(inv) {
  const paymentMethod =
    inv.frictionCause === 'expired_card' ? 'expired' :
    inv.frictionCause === 'unresponsive' ? 'none' : 'valid';
  const engagement = inv.frictionCause === 'unresponsive' ? {} : { opened: true };
  const customer =
    inv.history === 'clean' ? { invoicesPaid: 9, invoicesMissed: 1 } :
    inv.history === 'slow' ? { invoicesPaid: 6, invoicesMissed: 4 } : {};
  const contactAttempts = Math.min(7, Math.round((inv.daysOverdue || 0) / 14));
  return { ...inv, amountDue: inv.amount, paymentMethod, engagement, customer, contactAttempts };
}

function viewInvoice(inv) {
  return {
    id: inv.id,
    client: inv.client,
    amount: inv.amount,
    daysOverdue: inv.daysOverdue,
    score: inv.likelihood ? inv.likelihood.score : null,
    band: inv.likelihood ? inv.likelihood.band : null,
    expected: inv.expectedRecovery != null ? inv.expectedRecovery : null,
    driver: inv.likelihood && inv.likelihood.factors[0] ? inv.likelihood.factors[0].name : null,
  };
}

function viewApproval(item) {
  return {
    id: item.id,
    action: item.action,
    label: item.label,
    client: item.invoice ? item.invoice.client : '',
    amount: item.invoice ? item.invoice.amount : null,
    daysOverdue: item.invoice ? item.invoice.daysOverdue : null,
    discount: item.payload ? item.payload.discount : null,
  };
}

function treasury() {
  return { type: 'treasury', ...session.ledger.summary() };
}

function finishIfDone() {
  if (session && session.processed && session.approvals.pending() === 0) {
    log('LEDGER', 'Cycle complete. Every irreversible action was human-approved.');
    const s = session.ledger.summary();
    const out = session.outstanding || 0;
    const rate = out > 0 ? Math.round((s.recovered / out) * 100) : null;
    broadcast({ type: 'done', ...s, outstanding: out, rate });
  }
}

async function runCycle() {
  if (running) return;
  running = true;
  try {
    const ledger = new Ledger();
    const approvals = new ApprovalQueue((msg) => log('HUMAN', msg));
    const raw = await stripeApi.listOverdueInvoices();
    const ranked = prioritize(raw.map(toScoreInput));
    session = { ledger, approvals, invoices: ranked, processed: false };
    ledger.setTotal(ranked.length);

    broadcast({ type: 'reset' });
    broadcast({
      type: 'mode',
      stripe: stripeApi.isReal ? 'live test mode' : 'mock data',
      hermes: useHermes ? 'live' : 'rules fallback',
      nemotron: useNemotron ? 'live' : 'deterministic gate',
    });
    broadcast({ type: 'queue', items: ranked.map(viewInvoice) });

    const outstanding = ranked.reduce((s, i) => s + i.amount, 0);
    session.outstanding = outstanding;
    log('STRIPE', `Found ${ranked.length} overdue invoices ($${outstanding} outstanding)`);
    broadcast(treasury());

    const ctx = { ledger, approvals, log };
    for (const inv of ranked) {
      broadcast({ type: 'active', id: inv.id });
      const r = await agent.processInvoice(inv, ctx);
      if (r) {
        broadcast({
          type: 'draft',
          id: inv.id,
          client: inv.client,
          action: r.action,
          reason: r.decision && r.decision.reason ? r.decision.reason : '',
          message: r.message || '',
          screen: r.screen && r.screen.verdict ? r.screen.verdict : '',
          screenedBy: r.screen && r.screen.screenedBy ? r.screen.screenedBy : '',
        });
      }
      broadcast(treasury());
      broadcast({ type: 'approvals', items: approvals.list().map(viewApproval) });
      await sleep(750);
    }
    broadcast({ type: 'active', id: null });
    session.processed = true;

    if (approvals.pending() === 0) {
      finishIfDone();
    } else {
      log('HUMAN', `${approvals.pending()} irreversible action(s) waiting for your approval.`);
    }
  } catch (e) {
    log('RISK', 'Cycle error: ' + e.message);
  } finally {
    running = false;
  }
}

async function handleApprove(id, approved) {
  if (!session) return;
  const item = session.approvals.resolve(id, approved);
  if (!item) return;
  if (approved) {
    log('HUMAN', `Approved on dashboard: ${item.label}`);
    await agent.executeApproved(item, { ledger: session.ledger, log });
  } else {
    log('HUMAN', `Held for human review: ${item.label}`);
  }
  broadcast(treasury());
  broadcast({ type: 'approvals', items: session.approvals.list().map(viewApproval) });
  finishIfDone();
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    fs.readFile(DASHBOARD, (err, buf) => {
      if (err) { res.writeHead(500); res.end('dashboard.html not found next to server.js'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    clients.add(res);
    // Catch a late joiner up to current state.
    if (session) {
      res.write(`data: ${JSON.stringify({ type: 'queue', items: session.invoices.map(viewInvoice) })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'approvals', items: session.approvals.list().map(viewApproval) })}\n\n`);
      res.write(`data: ${JSON.stringify(treasury())}\n\n`);
    }
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 20000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const [h, n, s] = await Promise.all([
      llm.pingHermes().catch(() => ({ ok: false, status: 'error' })),
      llm.pingNemotron().catch(() => ({ ok: false, status: 'error' })),
      stripeApi.ping().catch(() => ({ ok: false, status: 'error' })),
    ]);
    const results = { hermes: h, nemotron: n, stripe: s };
    // light up the node telemetry too
    if (h.ms != null) broadcast({ type: 'wire', provider: 'HERMES', host: h.host, status: h.ok ? 200 : '', ms: h.ms });
    if (n.ms != null) broadcast({ type: 'wire', provider: 'NEMOTRON', host: n.host, status: n.ok ? 200 : '', ms: n.ms });
    if (s.ms != null) broadcast({ type: 'wire', provider: 'STRIPE', host: s.host, status: s.ok ? 200 : '', ms: s.ms });
    broadcast({ type: 'ping', results });
    res.end(JSON.stringify(results));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/run') {
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    runCycle();
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/approve') {
    const body = await readBody(req);
    let id = null, approved = false;
    try { const j = JSON.parse(body || '{}'); id = j.id; approved = Boolean(j.approved); } catch (_) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    if (id != null) handleApprove(id, approved);
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log('\n  SOLVENT command center → http://localhost:' + PORT);
  console.log('  Mode: ' + (stripeApi.isReal ? 'LIVE (Stripe test mode)' : 'mock data (no keys)'));
  console.log('  Hermes: ' + (useHermes ? 'live' : 'rules fallback') +
              ' · Nemotron: ' + (useNemotron ? 'live' : 'deterministic gate') + '\n');
  console.log('  Open the URL, click "Run recovery cycle", approve on the page. Ctrl+C to stop.');
  console.log('  Live connection test endpoint: POST /api/ping  (heartbeat enabled)\n');
});
