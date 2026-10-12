import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const rules = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk_live_[A-Za-z0-9]{16,}/,
  /\bre_[A-Za-z0-9]{24,}/,
];
const flagged = [];
for (const file of files) {
  if (/\.(jpg|jpeg|png|mp4|ico|woff2?)$/i.test(file)) continue;
  let text; try { text = readFileSync(file, "utf8"); } catch { continue; }
  if (rules.some(rule => rule.test(text))) flagged.push(file);
}
if (flagged.length) { console.error("Potential credentials in:", flagged.join(", ")); process.exitCode = 1; }
else console.log("Selected credential patterns: no matches in tracked files. Also enable GitHub secret scanning/push protection.");
