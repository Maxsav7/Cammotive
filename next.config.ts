import type { NextConfig } from "next";
import { baseContentSecurityPolicy, securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  typescript: { tsconfigPath: "tsconfig.next.json" },
  poweredByHeader: false,
  // Pages get their content security policy, with a nonce, from proxy.ts.
  async headers() {
    return [
      { source: "/:path*", headers: Object.entries(securityHeaders).map(([key, value]) => ({ key, value })) },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: baseContentSecurityPolicy }] },
    ];
  },
};

export default nextConfig;
