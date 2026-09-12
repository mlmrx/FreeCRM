export const auditLimits = { pageSize: 50, scanRows: 500, windowDays: 366, defaultDays: 30, cursorCharacters: 2400 } as const;
export const auditOutcomes = ['unknown', 'approved', 'rejected', 'expired', 'cancelled', 'executed'] as const;
export type AuditOutcome = typeof auditOutcomes[number];
export type AuditFilters = { from: string; to: string; actor: string; family: string; outcome: AuditOutcome | ''; record: string };
export type AuditEntry = { id: string; createdAt: string; actor: string; action: string; family: string; outcome: AuditOutcome; entityType: string; entityId: string | null; requestId: string };
export type AuditPage = {
  events: AuditEntry[];
  filters: AuditFilters;
  nextCursor: string | null;
  scanned: number;
  scanLimit: number;
  pageSize: number;
  partial: boolean;
  warnings: string[];
  canExport: boolean;
};

/** Only explicitly named outcomes count; a proposal/approval is not execution. */
export function auditOutcome(action: string): AuditOutcome {
  if (action === 'agent.run.executed') return 'executed';
  if (action === 'agent.approval.approved') return 'approved';
  if (action === 'agent.approval.rejected') return 'rejected';
  if (action === 'agent.approval.expired') return 'expired';
  if (action === 'agent.approval.cancelled') return 'cancelled';
  return 'unknown';
}

export const auditCsvColumns = ['event_id', 'created_at_utc', 'actor_id', 'action', 'action_family', 'outcome', 'entity_type', 'entity_id', 'request_id'] as const;

export function auditCsv(events: readonly AuditEntry[]): string {
  const cell = (value: string | null) => {
    const raw = value ?? '';
    const safe = /^[\s\u0000-\u001f]*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [auditCsvColumns.join(','), ...events.map((event) => [event.id, event.createdAt, event.actor, event.action, event.family, event.outcome, event.entityType, event.entityId, event.requestId].map(cell).join(','))].join('\r\n') + '\r\n';
}
