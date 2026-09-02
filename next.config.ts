import type { NextConfig } from 'next';
import path from 'node:path';
import { securityHeaders } from './lib/security-headers';

const nextConfig: NextConfig = {
  webpack(config, { webpack }) {
    const vercelRuntime = path.resolve(process.cwd(), 'server/vercel/cloudflare-workers.ts');
    config.resolve.alias['cloudflare:workers'] = vercelRuntime;
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^cloudflare:workers$/, vercelRuntime));
    return config;
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [...securityHeaders()],
    }];
  },
};

export default nextConfig;
