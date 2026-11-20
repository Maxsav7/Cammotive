// Phone and email checks shared by the booking and quote forms (in the browser, as
// people type) and the server (which has the final say). They catch mistakes and
// obvious fakes, not a determined liar: only a code sent by text or email proves
// someone owns a number or an inbox. The server also asks DNS whether the email's
// domain takes mail at all (lib/email-domain.ts).

// The ten digits of a US number, without a leading 1 (as typed: "(210) 393-1934", "+1 210…").
export function phoneDigits(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

// US numbers follow the North American Numbering Plan: area code and exchange each
// start 2–9, area codes never have 9 in the middle or end in 11 (those are 911-style
// service codes), and 37X and 96X are held in reserve. 555 numbers are fictional.
export function phoneProblem(raw: string): string | null {
  if (/[^\d\s().+-]/.test(raw)) return "Use digits only, like (210) 000-0000.";
  const digits = phoneDigits(raw);
  if (digits.length !== 10) return "Enter a 10-digit US mobile number.";
  const area = digits.slice(0, 3), exchange = digits.slice(3, 6);
  if (/^8(00|33|44|55|66|77|88)$/.test(area) || area === "900") return "Use a mobile number we can text, not a toll-free number.";
  if (!/^[2-9][0-8]\d$/.test(area) || area.endsWith("11") || /^(37|96)/.test(area)) return `Check the area code: ${area} isn't used for US phone numbers.`;
  if (exchange === "555") return "555 numbers aren't real. Enter your mobile number.";
  if (!/^[2-9]\d\d$/.test(exchange) || exchange.endsWith("11") || /^(\d)\1{9}$/.test(digits)) return "That isn't a real US phone number. Check the digits.";
  return null;
}

// As customers expect to see it: (210) 393-1934.
export function formatPhone(raw: string) {
  const d = phoneDigits(raw);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}

// Something before the @, then a domain of dot-separated labels (letters, digits,
// inner hyphens) ending in a top-level domain of two or more letters.
const EMAIL = /^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
export function emailProblem(raw: string): string | null {
  const email = raw.trim();
  if (!email) return "Enter your email address.";
  if (email.length > 254 || !EMAIL.test(email) || email.includes("..")) return "Enter a full email address, like name@gmail.com.";
  return null;
}

// Where most customers' email lives; a domain one or two typing slips away from one
// of these is probably a typo. Similar real providers are listed so they aren't "fixed".
const PROVIDERS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "live.com", "msn.com",
  "me.com", "mac.com", "mail.com", "gmx.com", "ymail.com", "att.net", "sbcglobal.net", "comcast.net", "verizon.net",
  "charter.net", "cox.net", "spectrum.net", "protonmail.com", "proton.me", "usaa.com"];
const TLD_SLIPS: Record<string, string> = { con: "com", cmo: "com", cpm: "com", comm: "com", coom: "com", ocm: "com", vom: "com", xom: "com", nte: "net", ent: "net", ogr: "org", rog: "org" };

// Edit distance counting a swap of neighbouring letters as one slip ("gmial").
function slips(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

// "Did you mean jim@gmail.com?" for jim@gmial.com, jim@gmail.con, jim@company.con.
export function emailSuggestion(raw: string): string | null {
  const email = raw.trim(), at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at), domain = email.slice(at + 1).toLowerCase();
  if (!domain || PROVIDERS.includes(domain)) return null;
  let best: { domain: string; distance: number } | null = null;
  for (const provider of PROVIDERS) {
    const distance = slips(domain, provider);
    if (distance <= (provider.length > 8 ? 2 : 1) && (!best || distance < best.distance)) best = { domain: provider, distance };
  }
  if (best) return `${local}@${best.domain}`;
  const dot = domain.lastIndexOf("."), tld = domain.slice(dot + 1);
  return dot > 0 && TLD_SLIPS[tld] ? `${local}@${domain.slice(0, dot)}.${TLD_SLIPS[tld]}` : null;
}
