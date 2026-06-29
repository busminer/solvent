// util/metrics.js — lightweight observability for the live dashboard.
// Records the most recent real call latency / host / status per provider.
// Pure observability: it never changes any agent decision or behavior.

const _last = {
  HERMES: null,   // { host, status, ms }
  NEMOTRON: null,
  STRIPE: null,
};

function record(provider, info) {
  if (!_last.hasOwnProperty(provider)) return;
  _last[provider] = { host: info.host || '', status: info.status != null ? info.status : '', ms: info.ms != null ? info.ms : null };
}

function get(provider) {
  return _last[provider] || null;
}

function snapshot() {
  return JSON.parse(JSON.stringify(_last));
}

module.exports = { record, get, snapshot };
