/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://206.189.146.134:3001/api/:path*',
      },
    ];
  },
};

export default nextConfig;
