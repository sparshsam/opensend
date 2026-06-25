import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.CAPACITOR_BUILD ? "export" : undefined,
  images: {
    unoptimized: process.env.CAPACITOR_BUILD ? true : undefined,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
