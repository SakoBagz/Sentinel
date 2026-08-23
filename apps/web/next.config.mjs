/** @type {import('next').NextConfig} */
const apiProxyOrigin = process.env.API_PROXY_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyOrigin}/api/:path*`,
      },
      {
        source: "/ws/:path*",
        destination: `${apiProxyOrigin}/ws/:path*`,
      },
    ];
  },
};

export default nextConfig;
