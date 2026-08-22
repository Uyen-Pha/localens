import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next dev cannot return a route-level 404 for an unknown generated param
  // while export mode is enabled; every other environment keeps static export.
  ...(process.env.NODE_ENV !== "development" ? { output: "export" } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
