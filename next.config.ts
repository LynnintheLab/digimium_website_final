import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  serverExternalPackages: ['mysql2', 'mmdb-lib'],
  experimental: { cpus: 2 },
};

export default nextConfig;
