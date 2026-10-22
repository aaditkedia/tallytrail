import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const apps = ['tallytrail', 'greengate', 'quorum', 'suppliers', 'proof'];
console.log(`Node ${process.version}; npm workspace setup`);
for (const name of apps) {
  const env = `apps/${name}/.env.local`;
  const example = `apps/${name}/.env.example`;
  const keys = existsSync(example) ? readFileSync(example, 'utf8').split('\n').filter(l => /^[A-Z][A-Z0-9_]*=/.test(l)).map(l => l.split('=')[0]) : [];
  const configured = existsSync(env) ? new Set(readFileSync(env, 'utf8').split('\n').filter(l => /^[A-Z][A-Z0-9_]*=.+/.test(l)).map(l => l.split('=')[0])) : new Set();
  console.log(`${name}: ${existsSync(`apps/${name}/src/app/page.tsx`) ? 'app source present' : 'source pending'}; env file ${existsSync(env) ? 'present' : 'absent'}; ${keys.filter(k => !configured.has(k) && !process.env[k]).length} example variables unconfigured`);
}
for (const name of ['drizzle-orm', 'drizzle-kit', '@neondatabase/serverless', '@neondatabase/auth', '@vercel/blob', '@solana/web3.js', '@coral-xyz/anchor', '@upstash/redis', '@upstash/ratelimit', 'stripe', 'playwright-core']) {
  let present = false;
  try { require.resolve(name); present = true; } catch {}
  console.log(`${name}: ${present ? 'resolvable' : 'not installed'}`);
}
let chromiumPath;
try { chromiumPath = require('playwright-core').chromium.executablePath(); } catch {}
const browserInstalled = [process.env.BROWSER_EXECUTABLE, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', chromiumPath].some(path => path && existsSync(path));
console.log(`browser: ${browserInstalled ? 'Chromium/Chrome executable present' : 'set BROWSER_EXECUTABLE or install Chromium to run browser:check'}`);
for (const cmd of ['cargo', 'rustc', 'anchor', 'solana']) {
  const directory = cmd === 'anchor' ? 'bin' : cmd === 'solana' ? 'solana-release/bin' : 'cargo/bin';
  const installed = fileURLToPath(new URL(`../.toolchains/${directory}/${cmd}`, import.meta.url));
  if (existsSync(installed)) { console.log(`${cmd}: installed locally (.toolchains/${directory}/${cmd})`); continue; }
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  console.log(`${cmd}: ${r.error ? `unavailable (${r.error.code})` : r.status === 0 ? r.stdout.trim().split('\n')[0] : `version command failed (${r.status})`}`);
}
