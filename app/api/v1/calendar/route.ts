import { getD1 } from '@/db';
import { ensureWorkspace } from '@/server/control-plane';
import { loadDataPlane } from '@/server/data-plane';
import { errorResponse, getRequestIdentity } from '@/server/request-context';
import { requirePermission } from '@/server/authorization';

export const dynamic = 'force-dynamic';

export const icsEscape = (value: string) => value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n');
const icsDate = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const db = getD1();
    const context = await ensureWorkspace(db, identity);
    requirePermission(context.workspace.role, 'records:read');
    const data = await loadDataPlane(db, context.workspaceId);
    const items = data.records.filter((record) => ['task', 'activity'].includes(record.objectType) && record.dueAt && !record.archivedAt);
    const events = items.flatMap((record) => [
      'BEGIN:VEVENT',
      `UID:${record.id}@free-crm`,
      `DTSTAMP:${icsDate(record.updatedAt)}`,
      `DTSTART:${icsDate(record.dueAt!)}`,
      `DTEND:${icsDate(new Date(new Date(record.dueAt!).getTime() + 30 * 60_000).toISOString())}`,
      `SUMMARY:${icsEscape(record.name)}`,
      `DESCRIPTION:${icsEscape(`${record.objectType} · ${record.status}${record.companyName ? ` · ${record.companyName}` : ''}`)}`,
      'END:VEVENT',
    ]);
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FREE CRM//Calendar//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n');
    return new Response(body, {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'attachment; filename="free-crm-calendar.ics"',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
