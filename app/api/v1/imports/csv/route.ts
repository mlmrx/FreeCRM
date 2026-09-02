import { getD1 } from '@/db';
import { requirePermission } from '@/server/authorization';
import { requireCapability } from '@/server/capabilities';
import { executeCommand, readCommandReplay, type CommandResponse } from '@/server/commands';
import { ensureWorkspace } from '@/server/control-plane';
import { CSV_IMPORT_MAX_BYTES, CSV_IMPORT_MAX_ROWS, CSV_IMPORT_REQUEST_MAX_BYTES, prepareCsvImport } from '@/server/csv-import';
import { ApiError, apiResponse, getRequestIdentity, readJsonObject, requestErrorResponse, requireSafeMutation } from '@/server/request-context';

export const dynamic = 'force-dynamic';

function importMode(value: unknown): 'preview' | 'commit' {
  if (value === 'preview' || value === 'commit') return value;
  throw new ApiError(400, 'validation_error', 'mode must be preview or commit.', { field: 'mode' });
}

function replayResponse(body: Record<string, unknown>, replay: CommandResponse): Response {
  if (replay.result.discardedByReset === true) {
    throw new ApiError(409, 'idempotency_receipt_discarded', 'A workspace reset discarded this prior CSV import receipt. Submit the import again with a new idempotency key.');
  }
  const objectType = body.objectType;
  const imported = replay.result.imported;
  const recordIds = replay.result.recordIds;
  const validObjectType = objectType === 'contact' || objectType === 'company' || objectType === 'lead';
  const validRecordIds = Array.isArray(recordIds)
    && recordIds.length === imported
    && recordIds.every((recordId) => typeof recordId === 'string' && recordId.length > 0 && recordId.length <= 128);
  if (replay.ok !== true || !validObjectType || !Number.isSafeInteger(imported) || Number(imported) < 1 || Number(imported) > CSV_IMPORT_MAX_ROWS || !validRecordIds) {
    throw new ApiError(500, 'idempotency_receipt_invalid', 'The stored CSV import receipt is invalid; no new import was performed.');
  }
  return apiResponse({
    data: {
      mode: 'commit',
      objectType,
      totalRows: imported,
      imported,
      recordIds,
    },
    replayed: true,
  });
}

export async function POST(request: Request) {
  try {
    await requireSafeMutation(request, 'application/json');
    const body = await readJsonObject(request, CSV_IMPORT_REQUEST_MAX_BYTES);
    const mode = importMode(body.mode);
    const idempotencyKey = request.headers.get('idempotency-key');
    if (mode === 'commit' && !idempotencyKey) {
      throw new ApiError(400, 'idempotency_key_required', 'Idempotency-Key header is required to commit a CSV import.');
    }
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const workspace = await ensureWorkspace(db, identity);
    requirePermission(workspace.workspace.role, 'records:write');
    if (mode === 'commit') {
      const replay = await readCommandReplay(db, workspace.workspaceId, 'csv.import', idempotencyKey!, JSON.stringify(body));
      if (replay) return replayResponse(body, replay);
    }
    await requireCapability(db, workspace, 'integrations');
    await requireCapability(db, workspace, 'relationships');
    const prepared = prepareCsvImport(body);

    if (mode === 'preview') {
      return apiResponse({
        data: {
          mode,
          objectType: prepared.objectType,
          columns: prepared.columns,
          mapping: prepared.mapping,
          totalRows: prepared.totalRows,
          validRows: prepared.records.length,
          invalidRows: prepared.errors.length,
          preview: prepared.preview,
          errors: prepared.errors,
          limits: { maxRows: CSV_IMPORT_MAX_ROWS, maxBytes: CSV_IMPORT_MAX_BYTES },
        },
      });
    }

    if (prepared.errors.length > 0) {
      throw new ApiError(422, 'csv_rows_invalid', 'Fix every invalid CSV row before committing the import.', {
        invalidRows: prepared.errors.length,
        errors: prepared.errors,
      });
    }
    const result = await executeCommand(
      db,
      identity,
      workspace,
      { type: 'csv.import', payload: { records: prepared.records } },
      idempotencyKey!,
      JSON.stringify(body),
    );
    return apiResponse({
      data: {
        mode,
        objectType: prepared.objectType,
        totalRows: prepared.totalRows,
        imported: result.result.imported,
        recordIds: result.result.recordIds,
      },
      replayed: result.replayed ?? false,
    }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return requestErrorResponse(request, error);
  }
}
