import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { securityHeaders } from "../lib/security-headers";

// On Cloudflare, files in dist/client are served before the Worker runs, so the
// Worker can't add headers to them. Cloudflare reads a `_headers` file instead;
// this writes one with the same security headers the Worker sets on pages.
export function staticHeaders(): Plugin {
  let root = process.cwd();
  return {
    name: "camotive-static-headers",
    apply: "build",
    configResolved(config) { root = config.root; },
    async closeBundle() {
      const client = resolve(root, "dist", "client");
      await mkdir(client, { recursive: true });
      const lines = Object.entries(securityHeaders).map(([key, value]) => `  ${key}: ${value}`);
      // Keeps vinext's own rule: fingerprinted build files never change, so
      // browsers can keep them for a year.
      await writeFile(resolve(client, "_headers"), `/*\n${lines.join("\n")}\n\n/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
    },
  };
}
