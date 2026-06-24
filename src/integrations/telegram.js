// integrations/telegram.js — interactive human approval over Telegram.
// Sends each pending action with ✅ Approve / ❌ Hold buttons, then waits for the tap.
// No webhook/hosting needed — it long-polls getUpdates from your machine.
const { telegram } = require('../config');

const API = (method) => `https://api.telegram.org/bot${telegram.token}/${method}`;
const enabled = Boolean(telegram.token && telegram.chatId);

let pollOffset = 0;

async function tg(method, body) {
  const res = await fetch(API(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Drain any old updates so a previous run's taps don't leak into this one.
async function init() {
  if (!enabled) return;
  try {
    const r = await fetch(API('getUpdates') + '?offset=-1&timeout=0');
    const data = await r.json();
    if (data.ok && data.result.length) {
      pollOffset = data.result[data.result.length - 1].update_id + 1;
    }
  } catch (_) { /* ignore */ }
}

function money(n) { return '$' + Number(n).toLocaleString('en-US'); }

// Send the approval card with inline buttons. Returns the message_id (or null).
async function sendApproval(item) {
  if (!enabled) return null;
  const inv = item.invoice;
  const text =
    `🟡 *SOLVENT needs your approval*\n\n` +
    `*${escapeMd(labelFor(item.action))}* — ${escapeMd(inv.client)}\n` +
    `\`#${inv.id}\` · ${money(inv.amount)} · ${inv.daysOverdue}d overdue` +
    (item.action === 'payment_plan' ? ` · installment 1 of 3` : ``) +
    `\n\nApprove to send, or hold for review.`;
  const r = await tg('sendMessage', {
    chat_id: telegram.chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Approve', callback_data: `approve:${item.id}` },
        { text: '❌ Hold', callback_data: `hold:${item.id}` },
      ]],
    },
  });
  return r.ok ? r.result.message_id : null;
}

// Wait for the tap on THIS item. Returns true (approve) / false (hold) / null (timeout).
async function waitForDecision(item, { timeoutMs = 180000 } = {}) {
  if (!enabled) return null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let data;
    try {
      const r = await fetch(API('getUpdates') + `?timeout=25&offset=${pollOffset}`);
      data = await r.json();
    } catch (_) { continue; }
    if (!data.ok) continue;
    for (const u of data.result) {
      pollOffset = u.update_id + 1;
      const cb = u.callback_query;
      if (!cb || !cb.data) continue;
      const [verdict, id] = cb.data.split(':');
      if (String(id) !== String(item.id)) continue;
      const approved = verdict === 'approve';
      // stop the button spinner
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: approved ? 'Approved ✅' : 'Held ❌' });
      // rewrite the card to show the result (looks clean on camera)
      const inv = item.invoice;
      await tg('editMessageText', {
        chat_id: telegram.chatId,
        message_id: cb.message.message_id,
        parse_mode: 'Markdown',
        text:
          (approved ? `✅ *Approved*` : `❌ *Held for review*`) + `\n\n` +
          `*${escapeMd(labelFor(item.action))}* — ${escapeMd(inv.client)}\n` +
          `\`#${inv.id}\` · ${money(inv.amount)} · ${inv.daysOverdue}d overdue`,
      });
      return approved;
    }
  }
  return null;
}

function labelFor(action) {
  return {
    firm_reminder: 'Firm reminder',
    payment_plan: 'Payment plan',
    settlement_offer: 'Settle-today discount',
    escalation: 'Escalation / write-off',
  }[action] || action;
}
function escapeMd(s) { return String(s).replace(/([_*`\[\]])/g, '\\$1'); }

module.exports = { enabled, init, sendApproval, waitForDecision };
