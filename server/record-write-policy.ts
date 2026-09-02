import type { CRMRecord } from '@/lib/crm-platform';
import { ApiError } from './request-context';
import type { cleanRecordInput } from './validation';

export const managedStatuses: Partial<Record<CRMRecord['objectType'], readonly string[]>> = {
  lead: ['converted'],
  quote: ['accepted'],
  invoice: ['sent', 'partial', 'paid', 'overdue', 'void'],
  ticket: ['resolved'],
};

export const protectedFields: Partial<Record<CRMRecord['objectType'], readonly string[]>> = {
  lead: ['convertedAt', 'contactId', 'companyId', 'opportunityId'],
  quote: ['acceptedAt', 'invoiceId'],
  invoice: ['invoiceNumber', 'issuedAt', 'paidCents', 'lastPaymentAt', 'payments', 'sourceQuoteId'],
  ticket: ['resolution', 'resolvedAt'],
  document: ['objectKey', 'originalName', 'contentType', 'size'],
};

export function assertSafeRecordCreate(input: ReturnType<typeof cleanRecordInput>) {
  if (!input.objectType) return;
  if (input.status && managedStatuses[input.objectType]?.includes(input.status)) {
    throw new ApiError(409, 'managed_transition_required', `${input.objectType} status ${input.status} must be set through its domain command.`);
  }
  const reserved = protectedFields[input.objectType] ?? [];
  if (input.fields && reserved.some((key) => Object.hasOwn(input.fields!, key))) {
    throw new ApiError(400, 'protected_field', `System-managed ${input.objectType} fields cannot be set through generic record creation.`);
  }
  if (input.closedAt && managedStatuses[input.objectType]?.length) {
    throw new ApiError(400, 'protected_field', `closedAt is managed by ${input.objectType} domain transitions.`);
  }
}
