#!/usr/bin/env node
// setup-repo.js — one-command GitHub setup for SOLVENT.
//
// 1) Create an EMPTY repo on github.com (no README/license) — note the name.
// 2) Run:  node setup-repo.js <your-username> <repo-name>
//    e.g.  node setup-repo.js kosa solvent
//
// It fills in README/LICENSE placeholders, makes a clean initial history,
// wires the remote, and pushes. Requires git installed and you signed in to GitHub.

const { execSync } = require('child_process');
const fs = require('fs');

const [user, repo] = process.argv.slice(2);
const DRY = process.env.SOLVENT_INIT_DRYRUN === '1';

if (!user || !repo) {
  console.log('\n  Usage:  node setup-repo.js <github-username> <repo-name>');
  console.log('  Example: node setup-repo.js kosa solvent');
  console.log('\n  First create an EMPTY repository at https://github.com/new (no README/.gitignore/license).\n');
  process.exit(1);
}

function run(cmd) {
  console.log('  $ ' + cmd);
  if (!DRY) execSync(cmd, { stdio: 'inherit' });
}

// 1) fill placeholders
for (const f of ['README.md', 'LICENSE']) {
  if (fs.existsSync(f)) {
    const s = fs.readFileSync(f, 'utf8').split('__GH_USER__').join(user).split('__GH_REPO__').join(repo);
    fs.writeFileSync(f, s);
  }
}
console.log(`  Filled placeholders → ${user}/${repo}\n`);

try {
  // 2) init + a clean, logical initial history
  run('git init -b main');

  run('git add package.json package-lock.json .gitignore .env.example');
  run('git commit -m "chore: project scaffold (npm, env, gitignore)"');

  run('git add src');
  run('git commit -m "feat: core recovery loop + Hermes/Nemotron/Stripe integrations"');

  run('git add reset-seed.js seed.js diag.js llmcheck.js setup-repo.js 2>/dev/null || git add reset-seed.js diag.js llmcheck.js setup-repo.js');
  run('git commit -m "feat: Stripe seeding, diagnostics, and model preflight tooling"');

  run('git add docs README.md LICENSE CONTRIBUTING.md ROADMAP.md');
  run('git commit -m "docs: README, whitepaper, architecture, license"');

  // 3) remote + push
  run(`git remote add origin https://github.com/${user}/${repo}.git`);
  run('git push -u origin main');

  console.log(`\n  Done → https://github.com/${user}/${repo}\n`);
} catch (e) {
  console.log('\n  Something stopped the script. Common fixes:');
  console.log('  • Git not installed → install from https://git-scm.com');
  console.log('  • Repo must exist and be EMPTY → create at https://github.com/new');
  console.log('  • Auth: when prompted, sign in to GitHub (or set up a token / GitHub CLI).');
  console.log('  • If a remote already exists:  git remote set-url origin https://github.com/' + user + '/' + repo + '.git  then  git push -u origin main\n');
  process.exit(1);
}
