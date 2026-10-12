import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  typescript: { tsconfigPath: "tsconfig.next.json" },
  poweredByHeader: false,
  async headers() { return [{ source: "/:path*", headers: Object.entries(securityHeaders).map(([key, value]) => ({ key, value })) }]; },
};

export default nextConfig;
