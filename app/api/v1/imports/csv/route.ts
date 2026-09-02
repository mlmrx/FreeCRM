import { getD1 } from '@/db';
import { requirePermission } from '@/server/authorization';
import { requireCapability } from '@/server/capabilities';
import { executeCommand } from '@/server/commands';
import { ensureWorkspace } from '@/server/control-plane';
import { CSV_IMPORT_MAX_BYTES, CSV_IMPORT_MAX_ROWS, CSV_IMPORT_REQUEST_MAX_BYTES, prepareCsvImport } from '@/server/csv-import';
import { ApiError, apiResponse, getRequestIdentity, readJsonObject, requestErrorResponse, requireSafeMutation } from '@/server/request-context';

export const dynamic = 'force-dynamic';

function importMode(value: unknown): 'preview' | 'commit' {
  if (value === 'preview' || value === 'commit') return value;
  throw new ApiError(400, 'validation_error', 'mode must be preview or commit.', { field: 'mode' });
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
