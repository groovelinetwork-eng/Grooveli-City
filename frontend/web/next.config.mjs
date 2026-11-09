/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@grooveli/shared'],

  // Proxy /city requests to the Vite dev server (Three.js app)
  async rewrites() {
    return [
      {
        source: '/city',
        destination: 'http://localhost:3001',
      },
      {
        source: '/city/:path*',
        destination: 'http://localhost:3001/:path*',
      },
    ];
  },
};

export default nextConfig;

