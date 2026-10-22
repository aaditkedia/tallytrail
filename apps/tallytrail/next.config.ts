import type { NextConfig } from 'next';
const config: NextConfig = { transpilePackages: ['@hackathon/swarm-core', '@hackathon/ui'], output: 'standalone', experimental: { cpus: 1, useTypeScriptCli: false, workerThreads: true } };
export default config;
