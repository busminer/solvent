// integrations/notify.js — notifications (approvals and events).
// Without a Telegram token, log to the console. With a token, send to your chat.
const { telegram } = require('../config');

function notify(text) {
  if (telegram.token && telegram.chatId) {
    // ── real version (Telegram Bot API) ──
    // fetch(`https://api.telegram.org/bot${telegram.token}/sendMessage`, {
    //   method: 'POST', headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ chat_id: telegram.chatId, text }),
    // }).catch(() => {});
    console.log('   📲 [telegram] ' + text);
  } else {
    console.log('   📲 ' + text);
  }
}

module.exports = { notify };
