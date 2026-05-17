import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Security and build configuration
  poweredByHeader: false,
  output: "standalone",
};

export default nextConfig;
