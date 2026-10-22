import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const runtime = ['drizzle-orm', '@neondatabase/auth', '@solana/web3.js', '@coral-xyz/anchor', '@upstash/redis', '@upstash/ratelimit'];
const development = ['drizzle-kit'];
for (const [packages, flag] of [[runtime, '--save'], [development, '--save-dev']]) {
  const missing = packages.filter(name => { try { require.resolve(name); return false; } catch { return true; } });
  if (!missing.length) continue;
  const result = spawnSync('npm', ['install', flag, '--save-exact', '--no-fund', '--no-audit', ...missing], { stdio: 'inherit' });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Optional integration SDKs installed. Follow each app README to configure services and enable examples.');
