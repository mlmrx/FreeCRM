import { csvImportTemplates, csvTemplateText } from '@/lib/csv-import-templates';

/** These files contain fixed public examples. This route never opens tenant storage. */
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await context.params;
  const template = csvImportTemplates.find((candidate) => candidate.filename === file);
  if (!template) return new Response('Template not found.', { status: 404, headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(csvTemplateText(template), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${template.filename}"`,
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
    },
  });
}
