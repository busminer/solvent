// llmcheck.js — quick preflight that both keys are live and the endpoints respond.
// Place next to package.json and run:  node llmcheck.js
require('dotenv').config();
const { nous, nvidia } = require('./src/config');

async function ping(name, base, key, body) {
  if (!key) { console.log('  ' + name + ': no key in .env — skipped'); return; }
  try {
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) {
      let content = '';
      try { content = JSON.parse(text).choices[0].message.content; } catch (_) {}
      console.log('  ' + name + ': OK (' + res.status + ')  ' + content.replace(/\s+/g, ' ').slice(0, 120));
    } else {
      console.log('  ' + name + ': ERROR ' + res.status + ' — ' + text.slice(0, 200));
    }
  } catch (e) {
    console.log('  ' + name + ': NETWORK/ERROR — ' + e.message);
  }
}

(async () => {
  console.log('\n  Model preflight:\n');
  await ping('HERMES   (' + nous.model + ')', nous.baseUrl, nous.apiKey, {
    model: nous.model, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
  });
  await ping('NEMOTRON (' + nvidia.model + ')', nvidia.baseUrl, nvidia.apiKey, {
    model: nvidia.model, max_tokens: 60, messages: [{ role: 'user', content: 'Hi, friendly reminder that your invoice is past due. Here is the payment link.' }],
  });
  console.log('');
})();
