import { describe, expect, it, vi } from 'vitest';
import { localizedAdaptiveExplanation, localizedAdaptiveSignal } from '@/lib/adaptive-presentation';
import type { AdaptiveSignal } from '@/lib/adaptive-types';

const signal: AdaptiveSignal = {
  id: 'overdue-task:record-1', kind: 'overdue-task', topic: 'relationships',
  title: 'Review overdue task: Close <script>customer</script>',
  detail: 'The task is recorded as open with a due date of 2026-09-10T10:00:00Z. Check whether the record reflects the current situation.',
  why: 'The stored due date has passed and the task is not marked complete. Matches your chosen focus.',
  certainty: 'recorded', score: 99, evidence: [], fingerprint: 'unchanged-v1', dueAt: '2026-09-10T10:00:00Z', state: 'new', snoozedUntil: null, suggestedTask: null,
};
const messages: Record<string, string> = {
  'Review overdue task: {name}': 'Revisar tarea vencida: {name}',
  'The task is recorded as {status} with a due date of {date}. Check whether the record reflects the current situation.': 'La tarea figura como {status}, con vencimiento {date}. Comprueba el registro.',
  'The stored due date has passed and the task is not marked complete.': 'La fecha venció y la tarea sigue pendiente.',
  'Matches your chosen focus.': 'Coincide con tu enfoque.',
  '{count} distinct recent signals; at least three are needed before a recommendation.': '{count} señales recientes distintas; se necesitan al menos tres.',
  'Suggested default adapted from {count} explicitly accepted follow-up intervals in the last 30 days. Review each task before creating it.': 'Intervalo adaptado de {count} seguimientos aceptados. Revisa cada tarea.',
  open: 'abierta',
  Close: 'Cerrar',
};
function text(source: string, values: Record<string, string | number> = {}) {
  return (messages[source] ?? source).replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

describe('adaptive generated guidance localization', () => {
  it('localizes exact engine templates while preserving customer values and the original signal', () => {
    const before = JSON.stringify(signal);
    const translator = vi.fn(text);
    const result = localizedAdaptiveSignal(signal, translator, 'es-ES');
    expect(result.title).toBe('Revisar tarea vencida: Close <script>customer</script>');
    expect(result.detail).toContain('La tarea figura como abierta');
    expect(result.why).toBe('La fecha venció y la tarea sigue pendiente. Coincide con tu enfoque.');
    expect(JSON.stringify(signal)).toBe(before);
    expect(translator.mock.calls.some(([source]) => source.includes('<script>'))).toBe(false);
    expect(translator.mock.calls.some(([source]) => source === 'Close')).toBe(false);
  });

  it('keeps unknown server wording and arbitrary whitespace unchanged', () => {
    const unknown = 'Close\n\n  a custom note\twith unusual spacing';
    expect(localizedAdaptiveExplanation(unknown, text, 'es-ES')).toBe(unknown);
    const result = localizedAdaptiveSignal({ ...signal, title: unknown, detail: unknown, why: unknown }, text, 'es-ES');
    expect(result).toEqual({ title: unknown, detail: unknown, why: unknown });
  });

  it('does not translate vendor announcement bodies even when they match an engine phrase', () => {
    const detail = 'Matches your chosen focus.';
    const result = localizedAdaptiveSignal({ ...signal, kind: 'release', title: 'Vendor announcement: Close', detail }, text, 'es-ES');
    expect(result.detail).toBe(detail);
  });

  it('uses structured numeric interpolation for engine-generated learning explanations', () => {
    expect(localizedAdaptiveExplanation('2 distinct recent signals; at least three are needed before a recommendation.', text, 'es-ES')).toBe('2 señales recientes distintas; se necesitan al menos tres.');
    expect(localizedAdaptiveExplanation('Suggested default adapted from 5 explicitly accepted follow-up intervals in the last 30 days. Review each task before creating it.', text, 'es-ES')).toBe('Intervalo adaptado de 5 seguimientos aceptados. Revisa cada tarea.');
  });
});
