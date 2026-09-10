import { describe, expect, it } from 'vitest';

import {
  initialTourState,
  searchTourSections,
  tourAudiences,
  tourNotes,
  tourReducer,
  tourSections,
  tourSummary,
  type AgentScenario,
  type TourAction,
  type TourState,
} from '@/lib/tour-model';

function act(...actions: TourAction[]): TourState {
  return actions.reduce(tourReducer, { ...initialTourState });
}

describe('synthetic tour journeys', () => {
  it('resolves every audience step, related section, and source destination', () => {
    const ids = new Set(tourSections.map((section) => section.id));
    expect(ids.size).toBe(tourSections.length);
    expect(new Set(tourAudiences.map((audience) => audience.id))).toEqual(
      new Set(['personal', 'business', 'enterprise', 'agentic', 'agents']),
    );
    for (const audience of tourAudiences) {
      expect(audience.path.length).toBeGreaterThan(1);
      expect(new Set(audience.path).size).toBe(audience.path.length);
      expect(audience.path.every((id) => ids.has(id))).toBe(true);
    }
    for (const section of tourSections) {
      expect(section.related.every((id) => ids.has(id))).toBe(true);
    }
    expect(tourNotes.every((note) => ids.has(note.destination))).toBe(true);
  });

  it('makes every section reachable through an audience path or a related section', () => {
    const reachable = new Set<string>(tourAudiences.flatMap((audience) => [...audience.path]));
    const pending = [...reachable];
    while (pending.length) {
      const currentId = pending.shift();
      const section = tourSections.find((item) => item.id === currentId);
      for (const id of section?.related ?? []) {
        if (!reachable.has(id)) { reachable.add(id); pending.push(id); }
      }
    }
    expect(reachable).toEqual(new Set(tourSections.map((section) => section.id)));
  });

  it('distinguishes available intelligence scenes and future controls', () => {
    for (const id of ['knowledge', 'today', 'capabilities']) {
      expect(tourSections.find((section) => section.id === id)?.status).toBe('Available');
    }
    expect(tourSections.find((section) => section.id === 'agents')?.status).toBe('Local simulator');
    expect(tourSections.find((section) => section.id === 'roadmap')?.status).toBe('Roadmap');
  });

  it('finds feature and delivery labels with case-insensitive, all-term search', () => {
    expect(searchTourSections('  CSV   VALIDATION ').map((section) => section.id)).toEqual(['integrations']);
    expect(searchTourSections('optional local AI').map((section) => section.id)).toEqual(['knowledge']);
    expect(searchTourSections('receipt').map((section) => section.id)).toEqual(['billing', 'agents']);
    expect(searchTourSections('CSV knowledge')).toEqual([]);
    expect(searchTourSections('   ')).toEqual(tourSections);
  });
});

describe('synthetic business state', () => {
  it('requires conversion and issue before recording payment', () => {
    expect(act({ type: 'pay' }, { type: 'issue' }).invoice).toBe('quote');
    const draft = act({ type: 'invoice' }, { type: 'pay' });
    expect(draft.invoice).toBe('draft');
    expect(tourSummary(draft).cash).toBe(0);
    const issued = tourReducer(draft, { type: 'issue' });
    expect(issued.invoice).toBe('issued');
    expect(tourSummary(issued).cash).toBe(0);
    const paid = tourReducer(issued, { type: 'pay' });
    expect(paid.invoice).toBe('paid');
    expect(tourSummary(paid).cash).toBe(4_800);
    expect(tourReducer(paid, { type: 'pay' })).toEqual(paid);
    expect(tourReducer(paid, { type: 'invoice' })).toEqual(paid);
  });

  it('requires corrected rows to be previewed again before import', () => {
    expect(act({ type: 'importCommit' }).imported).toBe(false);
    const invalidPreview = act({ type: 'importPreview' }, { type: 'importCommit' });
    expect(invalidPreview.imported).toBe(false);
    const corrected = tourReducer(invalidPreview, { type: 'importFix' });
    expect(corrected.importPreview).toBe(false);
    expect(tourReducer(corrected, { type: 'importCommit' }).imported).toBe(false);
    const imported = tourReducer(tourReducer(corrected, { type: 'importPreview' }), { type: 'importCommit' });
    expect(imported.imported).toBe(true);
    expect(tourSummary(imported).contacts).toBe(4);
    expect(tourSummary(tourReducer(imported, { type: 'importCommit' })).contacts).toBe(4);
  });

  it('keeps contact, task, service, and cash totals consistent with completed actions', () => {
    expect(tourSummary(initialTourState)).toEqual({ contacts: 2, pipeline: 42_800, cash: 0, openTasks: 2, openTickets: 1 });
    const state = act(
      { type: 'convert' }, { type: 'convert' },
      { type: 'importFix' }, { type: 'importPreview' }, { type: 'importCommit' },
      { type: 'task' }, { type: 'task' }, { type: 'followUp' }, { type: 'followUp' },
      { type: 'workflowRun' }, { type: 'workflowRun' },
      { type: 'ticket' }, { type: 'invoice' }, { type: 'issue' }, { type: 'pay' },
    );
    expect(tourSummary(state)).toEqual({ contacts: 5, pipeline: 42_800, cash: 4_800, openTasks: 3, openTickets: 0 });
  });

  it('creates one workflow task per sample event and honors the paused rule', () => {
    const paused = act({ type: 'workflowToggle' });
    expect(tourReducer(paused, { type: 'workflowRun' })).toEqual(paused);
    const executed = tourReducer(tourReducer(paused, { type: 'workflowToggle' }), { type: 'workflowRun' });
    expect(tourSummary(executed).openTasks).toBe(3);
    expect(tourReducer(executed, { type: 'workflowRun' })).toEqual(executed);
    const resumed = tourReducer(tourReducer(executed, { type: 'workflowToggle' }), { type: 'workflowToggle' });
    expect(tourSummary(tourReducer(resumed, { type: 'workflowRun' })).openTasks).toBe(3);
  });
});

describe('synthetic assistance controls', () => {
  it('requires explicit learning opt-in and refuses feedback while paused', () => {
    expect(act({ type: 'feedback' }).feedback).toBe(false);
    expect(act({ type: 'learning' }, { type: 'pause' }, { type: 'feedback' }).feedback).toBe(false);
    expect(act({ type: 'learning' }, { type: 'feedback' }).feedback).toBe(true);
  });

  it('blocks new reviewed follow-ups while paused and preserves existing tasks when forgotten', () => {
    expect(act({ type: 'pause' }, { type: 'followUp' }).followUp).toBe(false);
    const reviewed = act({ type: 'learning' }, { type: 'feedback' }, { type: 'followUp' });
    const forgotten = tourReducer(reviewed, { type: 'forget' });
    expect(forgotten).toMatchObject({ learning: false, feedback: false, followUp: true });
    expect(tourSummary(forgotten).openTasks).toBe(tourSummary(reviewed).openTasks);
  });

  it('supports undoing a capability pack without creating unrelated work', () => {
    const enabled = act({ type: 'pack' });
    expect(enabled.pack).toBe(true);
    const undone = tourReducer(enabled, { type: 'pack' });
    expect(undone).toEqual(initialTourState);
    expect(tourSummary(act({ type: 'proposal' }))).toEqual(tourSummary(initialTourState));
  });
});

describe('synthetic agent policy and receipts', () => {
  it('requires evaluation and approval before execution and replays without another effect', () => {
    expect(act({ type: 'approve' }, { type: 'execute' })).toEqual(initialTourState);
    const pending = act({ type: 'evaluate' }, { type: 'execute' });
    expect(pending).toMatchObject({ agent: 'pending', receipt: false });
    const approved = tourReducer(pending, { type: 'approve' });
    expect(approved).toMatchObject({ agent: 'approved', receipt: false });
    const executed = tourReducer(approved, { type: 'execute' });
    expect(executed).toMatchObject({ agent: 'executed', receipt: true });
    expect(tourSummary(executed)).toEqual(tourSummary(initialTourState));
    expect(tourReducer(executed, { type: 'execute' })).toEqual(executed);
  });

  it.each<AgentScenario>(['scope', 'budget', 'expired', 'revoked', 'external'])(
    'denies the %s request despite attempted approval and execution', (scenario) => {
      const state = act({ type: 'scenario', value: scenario }, { type: 'evaluate' }, { type: 'approve' }, { type: 'execute' });
      expect(state).toMatchObject({ agent: 'denied', receipt: false });
      expect(tourSummary(state)).toEqual(tourSummary(initialTourState));
    },
  );

  it('invalidates previous approval when the request changes', () => {
    const approved = act({ type: 'evaluate' }, { type: 'approve' });
    const changed = tourReducer(approved, { type: 'scenario', value: 'external' });
    expect(changed.agent).toBe('idle');
    expect(tourReducer(changed, { type: 'execute' }).receipt).toBe(false);
  });

  it('honors emergency stop before execution and keeps an existing receipt', () => {
    const stopped = act({ type: 'evaluate' }, { type: 'approve' }, { type: 'stop' }, { type: 'execute' });
    expect(stopped).toMatchObject({ stopped: true, agent: 'denied', receipt: false });
    expect(tourReducer(stopped, { type: 'evaluate' }).agent).toBe('denied');
    expect(tourReducer(stopped, { type: 'approve' }).agent).toBe('denied');
    const receipt = act({ type: 'evaluate' }, { type: 'approve' }, { type: 'execute' }, { type: 'stop' });
    expect(receipt).toMatchObject({ stopped: true, agent: 'denied', receipt: true });
  });

  it('resets a completed session including stop and receipts without changing the baseline', () => {
    const baseline = { ...initialTourState };
    const session = act(
      { type: 'convert' }, { type: 'invoice' }, { type: 'issue' }, { type: 'pay' },
      { type: 'task' }, { type: 'ticket' }, { type: 'campaign' }, { type: 'propose' },
      { type: 'learning' }, { type: 'feedback' }, { type: 'followUp' }, { type: 'pause' },
      { type: 'pack' }, { type: 'proposal' }, { type: 'workflowRun' },
      { type: 'importFix' }, { type: 'importPreview' }, { type: 'importCommit' },
      { type: 'evaluate' }, { type: 'approve' }, { type: 'execute' }, { type: 'stop' },
    );
    expect(tourReducer(session, { type: 'reset' })).toEqual(baseline);
    expect(initialTourState).toEqual(baseline);
    expect(tourReducer(session, { type: 'reset' })).not.toBe(initialTourState);
  });
});
