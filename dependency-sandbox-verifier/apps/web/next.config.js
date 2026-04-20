/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiBase = process.env.API_URL ?? 'http://localhost:3000';
    return [
      { source: '/api/:path*', destination: `${apiBase}/:path*` },
    ];
  },
};

module.exports = nextConfig;
