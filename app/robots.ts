import type { MetadataRoute } from 'next';

import { freeCrmSiteUrl } from '@/lib/public-config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/workspace', '/api/', '/auth/'],
    },
    sitemap: `${freeCrmSiteUrl}/sitemap.xml`,
    host: freeCrmSiteUrl,
  };
}
