import type { ReactNode } from 'react';
import type { AgentStep } from '@hackathon/swarm-core';

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'neutral' }) {
  const colors = { green: ['#e4f5ea', '#246643'], amber: ['#fff0d6', '#85580d'], red: ['#ffe8e4', '#a83d30'], neutral: ['#eef0ed', '#56615b'] };
  return <span style={{ display: 'inline-flex', padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 650, background: colors[tone][0], color: colors[tone][1] }}>{children}</span>;
}
export function SwarmTimeline({ steps, title = 'Swarm timeline' }: { steps: AgentStep[]; title?: string }) {
  const labels = { running: 'Running', completed: 'Completed', failed: 'Failed', awaiting_approval: 'Awaiting approval' };
  return <section aria-label={title} style={{ border: '1px solid #dfe5df', borderRadius: 18, padding: 24, background: '#fff' }}>
    <h3 style={{ margin: '0 0 20px', fontSize: 16 }}>{title}</h3>
    {steps.length === 0 && <p style={{ color: '#69776e', fontSize: 14 }}>Run a workflow to inspect its steps.</p>}
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 16 }}>
      {steps.map((step) => <li key={`${step.id}-${step.seq}`} aria-label={`Step ${step.seq}: ${step.name}, ${labels[step.status]}`} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span aria-hidden style={{ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, background: step.status === 'failed' ? '#ffe5df' : '#eaf2eb' }}>{step.status === 'completed' ? '✓' : step.status === 'failed' ? '!' : step.seq}</span>
        <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}><strong style={{ fontSize: 13 }}>{step.name}</strong><span style={{ display: 'block', fontSize: 11, marginTop: 3, color: step.status === 'failed' ? '#a83d30' : '#56615b' }}>{labels[step.status]}</span><p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.5, color: '#66736b' }}>{step.detail}</p></div>
        {step.durationMs !== undefined && <small style={{ color: '#56615b', flexShrink: 0 }}>{step.durationMs} ms</small>}
      </li>)}
    </ol>
  </section>;
}

export function RecoveryPanel({ app, missing = false, onRetry }: { app: string; missing?: boolean; onRetry?: () => void }) {
  return <main style={{ width: 'min(100% - 40px, 580px)', margin: '12vh auto', padding: 28, background: '#fff', border: '1px solid #dfe5df', borderRadius: 18, color: '#20372f', fontFamily: 'Arial, sans-serif', overflowWrap: 'anywhere' }}>
    <p style={{ fontWeight: 700, fontSize: 14, color: '#246643' }}>{app}</p>
    <h1 style={{ fontSize: 28, lineHeight: 1.2 }}>{missing ? 'This page could not be found.' : 'This view could not be loaded.'}</h1>
    <p style={{ color: '#56615b', lineHeight: 1.65 }}>{missing ? 'Check the address or return to the app to continue.' : 'Try loading the view again. If it keeps failing, check the local server and reopen the app.'}</p>
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginTop: 24 }}>
      {onRetry && <button onClick={onRetry} style={{ padding: '12px 18px', background: '#246643', color: '#fff', borderRadius: 8, border: 0, font: 'inherit', cursor: 'pointer' }}>Try again</button>}
      <a href="/" style={{ color: '#246643', textDecoration: 'underline', textUnderlineOffset: 4 }}>Return to {app}</a>
    </div>
  </main>;
}
