import type { NextConfig } from 'next';
import path from 'node:path';

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
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};

export default nextConfig;
