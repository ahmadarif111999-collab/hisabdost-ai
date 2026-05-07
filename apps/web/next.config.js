/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@pakbooks/shared'],

  // Temporary beta setting:
  // Allows partner-testing deployment even if some TypeScript/lint issues remain.
  // Remove this later before serious production use.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
