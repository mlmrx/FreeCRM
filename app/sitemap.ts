import type { MetadataRoute } from 'next';

import { editorialArticles, listEditorialArticlesNewestFirst } from '@/lib/editorial-content';

const siteUrl = 'https://www.freecrm.dev';

export default function sitemap(): MetadataRoute.Sitemap {
  const updatedAt = new Date(`${listEditorialArticlesNewestFirst()[0].publishedAt}T12:00:00Z`);
  const staticRoutes = ['', '/how-it-works', '/insights', '/contribute', '/deploy'].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: updatedAt,
    changeFrequency: path === '/insights' ? 'daily' as const : 'weekly' as const,
    priority: path === '' ? 1 : path === '/insights' ? .9 : .7,
  }));
  const articleRoutes = editorialArticles.map((article) => ({
    url: `${siteUrl}/insights/${article.slug}`,
    lastModified: new Date(`${article.publishedAt}T12:00:00Z`),
    changeFrequency: 'monthly' as const,
    priority: .75,
  }));
  return [...staticRoutes, ...articleRoutes];
}
