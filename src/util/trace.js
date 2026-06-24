// util/trace.js — thin network-call tracer for the video/verbose mode.
// Enabled with --verbose (or -v, or VERBOSE=1). Otherwise silent, so the demo stays clean.

const VERBOSE =
  process.argv.includes('--verbose') ||
  process.argv.includes('-v') ||
  process.env.VERBOSE === '1';

const C = {
  HERMES: '\x1b[95m',
  NEMOTRON: '\x1b[92m',
  STRIPE: '\x1b[35m',
  DIM: '\x1b[90m',
  RESET: '\x1b[0m',
};

function host(url) {
  return String(url).replace(/^https?:\/\//, '').split('/')[0];
}

// Prints a connection line only in verbose mode.
function trace(tag, txt) {
  if (!VERBOSE) return;
  const c = C[tag] || '';
  console.log(`  ${c}[${tag}]${C.RESET} ${C.DIM}${txt}${C.RESET}`);
}

module.exports = { VERBOSE, trace, host };
