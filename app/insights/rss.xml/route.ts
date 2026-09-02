import { listEditorialArticlesNewestFirst } from '@/lib/editorial-content';
import { freeCrmSiteUrl } from '@/lib/public-config';

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function GET() {
  const items = listEditorialArticlesNewestFirst().map((article) => `<item>
    <title>${escapeXml(article.title)}</title>
    <link>${freeCrmSiteUrl}/insights/${article.slug}</link>
    <guid isPermaLink="true">${freeCrmSiteUrl}/insights/${article.slug}</guid>
    <pubDate>${new Date(`${article.publishedAt}T12:00:00Z`).toUTCString()}</pubDate>
    <category>${escapeXml(article.category)}</category>
    <description>${escapeXml(article.description)}</description>
  </item>`).join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>FREE CRM Insights</title>
    <link>${freeCrmSiteUrl}/insights</link>
    <description>Open CRM, Agentic CRM, CRM for Agents, research, news, and practical relationship work.</description>
    <language>en-us</language>
    ${items}
  </channel>
</rss>`;

  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=21600' } });
}
