import { listEditorialArticlesNewestFirst } from '@/lib/editorial-content';

const siteUrl = 'https://www.freecrm.dev';

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function GET() {
  const items = listEditorialArticlesNewestFirst().map((article) => `<item>
    <title>${escapeXml(article.title)}</title>
    <link>${siteUrl}/insights/${article.slug}</link>
    <guid isPermaLink="true">${siteUrl}/insights/${article.slug}</guid>
    <pubDate>${new Date(`${article.publishedAt}T12:00:00Z`).toUTCString()}</pubDate>
    <category>${escapeXml(article.category)}</category>
    <description>${escapeXml(article.description)}</description>
  </item>`).join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>FREE CRM Insights</title>
    <link>${siteUrl}/insights</link>
    <description>Open CRM, Agentic CRM, CRM for Agents, research, news, and practical relationship work.</description>
    <language>en-us</language>
    ${items}
  </channel>
</rss>`;

  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=21600' } });
}
