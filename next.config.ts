import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig = (phase: string): NextConfig => ({
  env: {
    // Next inlines this value into the build, so page loads and server restarts cannot change it.
    BUILD_TIMESTAMP: phase === PHASE_DEVELOPMENT_SERVER ? "" : new Date().toISOString(),
  },
});

export default nextConfig;
