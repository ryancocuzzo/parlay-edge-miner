/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client', 'prisma'],
  env: { BUILT_AT: new Date().toISOString() },
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
};

module.exports = nextConfig;
