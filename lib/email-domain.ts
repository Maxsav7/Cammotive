// Server only: does the domain of an email address take email at all? Asks
// Cloudflare's public DNS (DNS over HTTPS, so it works on Vercel and on Cloudflare).
// "No" only when DNS says so for certain: the domain doesn't exist, it publishes a
// "null MX" (RFC 7505: no email here), or it has neither mail servers nor an address.
// If the lookup fails or times out, the answer is "yes": an outage at the DNS
// provider must never stop a real customer from booking.
import { HttpError } from "./booking-security";
import { invalidEmail } from "./contact-checks";
import { dnsApi } from "./providers";

type Answer = { Status: number; Answer?: { type: number; data: string }[] };
const MX = 15, A = 1, AAAA = 28;

// Per server instance: each domain is looked up once an hour (a failed lookup, once a minute).
const known = new Map<string, { accepts: boolean; until: number }>();

async function lookup(name: string, type: "MX" | "A" | "AAAA"): Promise<Answer> {
  const response = await fetch(`${dnsApi()}?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" }, cache: "no-store", signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error("DNS lookup failed");
  return response.json() as Promise<Answer>;
}
const records = (answer: Answer, type: number) => (answer.Answer ?? []).filter(r => r.type === type);

export async function emailDomainAccepts(email: string) {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  const now = Date.now(), cached = known.get(domain);
  if (cached && cached.until > now) return cached.accepts;
  let accepts = true, certain = false;
  try {
    const mx = await lookup(domain, "MX");
    if (mx.Status === 3) { accepts = false; certain = true; } // no such domain
    else if (mx.Status === 0) {
      certain = true;
      const servers = records(mx, MX).map(r => r.data.trim());
      if (servers.length) accepts = !servers.every(s => /^0\s+\.?$/.test(s));
      else {
        // No mail servers listed: mail then goes to the domain's own address, if it has one.
        const [a, aaaa] = await Promise.all([lookup(domain, "A"), lookup(domain, "AAAA")]);
        accepts = records(a, A).length + records(aaaa, AAAA).length > 0;
      }
    }
  } catch { accepts = true; certain = false; }
  if (known.size > 2000) known.clear();
  known.set(domain, { accepts, until: now + (certain ? 3_600_000 : 60_000) });
  return accepts;
}

export async function checkEmailDomain(email: string) {
  if (!await emailDomainAccepts(email)) throw new HttpError(400, invalidEmail, "email");
}
