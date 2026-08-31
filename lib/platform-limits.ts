/**
 * Bounded first-release limits keep bootstrap and portable exports inside the
 * Cloudflare Worker memory envelope. Higher-volume profiles will move to the
 * paginated data-plane API before these values are raised.
 */
export const platformLimits = {
  workspaceRecords: 1_000,
  recordFieldsBytes: 4_096,
  recordTagsBytes: 1_024,
  workspaceNotes: 2_500,
  notesPerRecord: 50,
  noteBodyCharacters: 2_000,
  workspaceLinks: 5_000,
  workspacePayments: 5_000,
  paymentsPerInvoice: 100,
  workspaceAgents: 100,
  webhookDeliveriesPerDay: 1_000,
  webhookReceiptsPerConnection: 50_000,
  webhookReceiptRetentionDays: 30,
  webhookReceiptPruneBatch: 100,
} as const;
