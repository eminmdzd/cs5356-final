/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["images.ctfassets.net"],
  },
  experimental: {
    nodeMiddleware: true,
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  serverExternalPackages: ["pdf.js-extract"],
  // Temporarily disable type checking and linting during build
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
