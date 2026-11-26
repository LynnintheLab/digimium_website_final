import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  serverExternalPackages: ['mysql2', 'mmdb-lib'],
  experimental: { cpus: 2 },
  async headers() {
    const headers = [
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests" },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
    ];
    return ['/account/:path*', '/order-history/:path*', '/runninghub/:path*', '/admin/:path*', '/api/:path*'].map(source => ({
      source,
      // Native admin POST forms need a non-opaque Origin. Cross-origin referrers
      // remain suppressed, and customer/API responses keep no-referrer.
      headers: headers.map(header => header.key === 'Referrer-Policy' && source === '/admin/:path*'
        ? { ...header, value: 'same-origin' } : header),
    }));
  },
};

export default nextConfig;
