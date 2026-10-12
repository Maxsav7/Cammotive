// Dependency audit gate for CI.
// - Production dependencies (what runs on Vercel): ANY high/critical advisory fails.
// - Full tree (incl. build/test tools): high/critical fails unless the advisory is
//   listed below with a reason and a review-by date. Expired entries fail too, so
//   an exception can't be forgotten.
import { execFileSync } from "node:child_process";

const accepted = {
  "GHSA-vfj7-8cjw-p6xm": {
    package: "braces",
    reason: "No patched release exists (latest 3.0.3). Reached only through eslint-config-next (lint) and vinext's vite-plugin-commonjs (Cloudflare build); neither runs on Vercel, and both only expand glob patterns written in this repo, not user input.",
    reviewBy: "2027-01-15",
  },
};

function audit(args) {
  try {
    return JSON.parse(execFileSync("npm", ["audit", "--json", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }));
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout); // npm audit exits non-zero when it finds anything
    throw error;
  }
}

// The advisory IDs behind each high/critical finding (transitive entries resolve to their root advisories).
function findings(report) {
  const vulns = report.vulnerabilities ?? {};
  const roots = (name, seen = new Set()) => {
    if (seen.has(name)) return []; seen.add(name);
    return (vulns[name]?.via ?? []).flatMap(via => typeof via === "string" ? roots(via, seen) : [{ id: via.url?.split("/").pop(), package: via.name, title: via.title, severity: via.severity }]);
  };
  const result = new Map();
  for (const [name, vuln] of Object.entries(vulns)) {
    if (!["high", "critical"].includes(vuln.severity)) continue;
    for (const root of roots(name)) if (["high", "critical"].includes(root.severity)) result.set(root.id, root);
  }
  return [...result.values()];
}

const today = new Date().toISOString().slice(0, 10);
const failures = [];

for (const finding of findings(audit(["--omit=dev"])))
  failures.push(`production dependency: ${finding.package} ${finding.id} — ${finding.title}`);

for (const finding of findings(audit([]))) {
  const exception = accepted[finding.id];
  if (!exception) failures.push(`${finding.package} ${finding.id} — ${finding.title}`);
  else if (exception.reviewBy < today) failures.push(`${finding.package} ${finding.id} — accepted exception expired on ${exception.reviewBy}; recheck for a fix and update scripts/audit.mjs`);
  else console.log(`accepted until ${exception.reviewBy}: ${finding.package} ${finding.id} (${exception.reason})`);
}

if (failures.length) {
  console.error(`High/critical advisories need attention:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("Dependency audit passed: no unaccepted high/critical advisories; production dependencies clean.");
}
