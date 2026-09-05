import type { MetadataRoute } from 'next';

import { editorialArticles, listEditorialArticlesNewestFirst } from '@/lib/editorial-content';
import { freeCrmSiteUrl } from '@/lib/public-config';

export default function sitemap(): MetadataRoute.Sitemap {
  const updatedAt = new Date(`${listEditorialArticlesNewestFirst()[0].publishedAt}T12:00:00Z`);
  const staticRoutes = ['', '/start', '/how-it-works', '/platform', '/tour', '/insights', '/contribute', '/deploy', '/deploy/readiness'].map((path) => ({
    url: `${freeCrmSiteUrl}${path}`,
    lastModified: updatedAt,
    changeFrequency: path === '/insights' ? 'daily' as const : 'weekly' as const,
    priority: path === '' ? 1 : path === '/insights' ? .9 : .7,
  }));
  const articleRoutes = editorialArticles.map((article) => ({
    url: `${freeCrmSiteUrl}/insights/${article.slug}`,
    lastModified: new Date(`${article.publishedAt}T12:00:00Z`),
    changeFrequency: 'monthly' as const,
    priority: .75,
  }));
  return [...staticRoutes, ...articleRoutes];
}
