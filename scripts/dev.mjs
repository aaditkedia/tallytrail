import { spawn } from 'node:child_process';
const apps = ['tallytrail'];
const selected = process.argv.slice(2);
if (selected.some(x => !apps.includes(x))) { console.error(`Choose: ${apps.join(', ')}`); process.exit(1); }
const children = (selected.length ? selected : apps).map(name => spawn('npm', ['run', 'dev', '--workspace', `@hackathon/${name}`], { stdio: 'inherit' }));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const child of children) child.kill(signal); });
for (const child of children) child.on('exit', code => { if (code) { process.exitCode = code; for (const other of children) other.kill(); } });
