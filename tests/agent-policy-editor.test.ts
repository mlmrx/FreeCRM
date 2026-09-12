import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import AgentPolicyEditor, { PolicyEditorFields } from '@/app/agent-policy-editor';
import { defaultAgentPolicy } from '@/lib/agent-policy';
import type { PolicySettings } from '@/lib/agent-policy-client';

const draft = defaultAgentPolicy(['revoked-tool'], 100);
const settings: PolicySettings = { agentId: 'agent', active: null, draft, tools: [], budgetCeilingCents: 100, spentCents: 0, agentStatus: 'active', emergencyStopped: false, history: [], externalExecution: false };
describe('policy editor accessible states', () => {
  it('renders a native keyboard-operable disclosure and truthful no-execution instructions', () => {
    const html = renderToStaticMarkup(createElement(AgentPolicyEditor, { agentId: 'agent' }));
    expect(html).toContain('<summary>Policy &amp; dry-run</summary>');
    expect(html).toContain('Nothing runs during dry-run.'); expect(html).toContain('External execution remains disabled.');
    expect(html).toContain('Load policy');
  });
  it('exposes revoked selected tools as removable choices rather than hidden unsaveable IDs', () => {
    const html = renderToStaticMarkup(createElement(PolicyEditorFields, { draft, settings, disabled: false, onChange: () => {} }));
    expect(html).toContain('Previously selected tools with no current grant'); expect(html).toContain('revoked-tool');
    expect(html).toContain('Uncheck to remove it from this draft before saving.');
    expect(html).toMatch(/<input type="checkbox" checked=""\/><span>revoked-tool/);
    for (const label of ['Record types', 'Optional record IDs', 'Maximum records per read', 'Policy budget ceiling', 'Policy expiry', 'Require human approval', 'Stop new work']) expect(html).toContain(label);
  });
  it('locks all draft controls while an activation or dry-run is in flight', () => {
    const html = renderToStaticMarkup(createElement(PolicyEditorFields, { draft, settings, disabled: true, onChange: () => {} }));
    expect(html).toMatch(/<fieldset disabled=""/);
  });
  it('hides stale safety settings and previews during render, while automatic reload preserves the draft', () => {
    const source = readFileSync(new URL('../app/agent-policy-editor.tsx', import.meta.url), 'utf8');
    expect(source).toContain('loaded?.revision === revision ? loaded.settings : null');
    expect(source).toContain('currentMessages && decision');
    expect(source).toContain('policyDraftAfterRefresh(sameAgent ? previous : null, current.draft, preserveDraft)');
    expect(source).toContain('requests.current(ticket)');
    expect(source).toContain('earlier preview is no longer valid');
    const integration = readFileSync(new URL('../app/crm-app.tsx', import.meta.url), 'utf8');
    expect(integration).toContain('safetyRevision={agentPolicySafetyRevision(agent, clock)}');
    expect(integration).not.toContain('key={agentPolicySafetyRevision');
  });
});
