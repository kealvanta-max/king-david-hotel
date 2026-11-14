import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@king-david/contracts', '@king-david/db', '@king-david/policy'],
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1', 'localhost', '*.e2b.app'],
  outputFileTracingRoot: process.cwd() + '/../..',
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      // The Arena live preview is embedded cross-origin. Keep clickjacking protection on deployed production.
      ...(process.env.NODE_ENV === 'production' ? [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] : []),
    ] }];
  },
};
export default config;
