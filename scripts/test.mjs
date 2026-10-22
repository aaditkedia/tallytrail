import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name === '.next' || e.name === '.data' ? [] : e.isDirectory() ? walk(join(dir, e.name)) : /\.(test|spec)\.[cm]?[jt]s$/.test(e.name) ? [join(dir, e.name)] : []); }
const selected = new Set(process.argv.slice(2));
const appNames = new Set(readdirSync('apps', { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name));
if (!appNames.size) { console.error('No apps/ directory'); process.exit(1); }
if ([...selected].some(name => !appNames.has(name))) { console.error('Unknown app filter'); process.exit(1); }
const tests = [...walk('apps'), ...walk('packages')].filter(file => !selected.size || file.startsWith('packages/') || selected.has(file.split('/')[1]));
if (!tests.length) { console.error('No tests found'); process.exit(1); }
for (const file of tests) {
  const parts = file.split('/');
  const tsconfig = resolve(parts[0], parts[1], 'tsconfig.json');
  const result = spawnSync(process.execPath, ['--import', 'tsx', file], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', TSX_TSCONFIG_PATH: tsconfig } });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`All ${tests.length} test files passed.`);
