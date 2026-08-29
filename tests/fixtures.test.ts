import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { actorKinds, isWorkspaceProfile } from '@/lib/multi-edition';

type Fixture = { id: string; profile: string; actors: string[]; capabilities: string[]; agent?: { autonomy: string; status: string; monthlyBudgetCents: number } };
const fixtures = JSON.parse(readFileSync(new URL('../fixtures/workspace-profiles.json', import.meta.url), 'utf8')) as Fixture[];

describe('representative workspace fixtures', () => {
  it('covers personal, business, enterprise, and agentic operation with valid actors', () => {
    expect(fixtures.map((fixture) => fixture.id)).toEqual(['fixture-personal', 'fixture-business', 'fixture-enterprise', 'fixture-agentic']);
    expect(fixtures.every((fixture) => isWorkspaceProfile(fixture.profile))).toBe(true);
    expect(fixtures.flatMap((fixture) => fixture.actors).every((kind) => (actorKinds as readonly string[]).includes(kind))).toBe(true);
    expect(fixtures.find((fixture) => fixture.id === 'fixture-agentic')?.agent).toEqual({ autonomy: 'approval-required', status: 'paused', monthlyBudgetCents: 2500 });
  });
});
