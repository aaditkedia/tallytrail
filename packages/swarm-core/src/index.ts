import type { ZodType } from 'zod';

export type StepStatus = 'running' | 'completed' | 'failed' | 'awaiting_approval';
export interface AgentStep {
  id: string; seq: number; name: string; status: StepStatus; detail: string;
  durationMs?: number; output?: unknown;
}

/** Next may normalize request.url to localhost; Host retains the browser's authority. */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (!host) return url.origin;
  if (/[\s/@\\#?,]/.test(host)) throw new Error('Invalid Host header');
  const authority = new URL(`${url.protocol}//${host}`);
  if (authority.pathname !== '/' || !authority.hostname) throw new Error('Invalid Host header');
  return authority.origin;
}
export interface Agent<T = unknown> {
  name: string;
  outputSchema: ZodType<T>;
  execute(input: unknown, context: { signal: AbortSignal }): Promise<unknown>;
  timeoutMs?: number;
  retries?: number;
}
export interface SwarmOptions {
  input: unknown; planner: Agent; specialists: Agent[]; critic: Agent;
  humanGate?: boolean;
  onStep?: (step: AgentStep) => void | Promise<void>;
}
export async function runSwarm(options: SwarmOptions) {
  const id = crypto.randomUUID();
  const steps: AgentStep[] = [];
  async function emit(step: Omit<AgentStep, 'seq'>) {
    const event = { ...step, seq: steps.length + 1 };
    steps.push(event);
    await options.onStep?.(event);
  }
  async function run(agent: Agent, input: unknown) {
    const maxAttempts = Math.max(1, Math.min(2, (agent.retries ?? 0) + 1));
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const stepId = crypto.randomUUID();
      const start = performance.now();
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      await emit({ id: stepId, name: agent.name, status: 'running', detail: `Attempt ${attempt + 1}` });
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Agent timeout')); }, Math.max(1, Math.min(60_000, agent.timeoutMs ?? 15_000)));
        });
        const raw = await Promise.race([Promise.resolve().then(() => agent.execute(input, { signal: controller.signal })), timeout]);
        const output = agent.outputSchema.parse(raw);
        await emit({ id: stepId, name: agent.name, status: 'completed', detail: 'Validated output', output, durationMs: Math.round(performance.now() - start) });
        return output;
      } catch (error) {
        await emit({ id: stepId, name: agent.name, status: 'failed', detail: error instanceof Error ? error.message : 'Agent failed', durationMs: Math.round(performance.now() - start) });
        if (attempt + 1 === maxAttempts) throw error;
      } finally { clearTimeout(timer); }
    }
    throw new Error('No agent attempt');
  }
  const plan = await run(options.planner, options.input);
  const results = await Promise.allSettled(options.specialists.map(agent => run(agent, { input: options.input, plan })));
  const output = await run(options.critic, { input: options.input, plan, results: results.map((r, i) => r.status === 'fulfilled' ? { name: options.specialists[i].name, status: 'fulfilled', output: r.value } : { name: options.specialists[i].name, status: 'rejected', error: 'Specialist failed; inspect trace' }) });
  if (options.humanGate) await emit({ id: crypto.randomUUID(), name: 'Human approval', status: 'awaiting_approval', detail: 'Review the evidence before export or publication.' });
  return { id, status: options.humanGate ? 'awaiting_approval' as const : 'completed' as const, plan, results, output, steps };
}

/** Redaction and screening are limited safeguards, not a complete injection defense. */
export function redactPII(text: string): string {
  return text.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]').replace(/(?<!\w)(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}\b/g, '[phone]');
}
export function screenInput(text: string) {
  return { text: redactPII(text).slice(0, 20_000), flagged: /ignore\s+(all\s+)?(previous|prior)\s+instructions|reveal\s+(the\s+)?(system\s+prompt|secret|api\s*key)|<\/?system>/i.test(text) };
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v)).join(',') + '}';
}
export async function inputHash(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}
