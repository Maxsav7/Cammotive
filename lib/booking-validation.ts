import { z } from "zod";
import { prices, extras, includedAddOns, bookingTimes, bookablePackages, bookingWindowDays, quoteServices } from "./booking-catalog";
import { emailProblem, phoneDigits, phoneProblem } from "./contact-checks";
import { HttpError } from "./booking-security";
const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
export function chicagoDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const timestamp = Date.parse(`${v}T12:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === v;
});
// Bookable from tomorrow (Chicago time) through the booking window.
export function bookableDay(v: string) {
  return v > chicagoDay() && v <= addDays(chicagoDay(), bookingWindowDays);
}
// A customer's email and mobile number, checked the same way as in the forms
// (lib/contact-checks.ts); stored lower-case, and as +1 and ten digits.
const check = (problem: (value: string) => string | null) => (value: string, ctx: z.RefinementCtx) => {
  const message = problem(value);
  if (message) ctx.addIssue({ code: "custom", message });
};
const contactEmail = z.string().max(254, "Invalid email address.").superRefine(check(emailProblem)).transform(v => v.trim().toLowerCase());
const contactPhone = z.string().max(30, "Invalid phone number.").superRefine(check(phoneProblem)).transform(v => `+1${phoneDigits(v)}`);
// A form that failed on the email or phone says which, so the page can point at it.
export function contactError(error: z.ZodError) {
  const issue = error.issues.find(i => i.path[0] === "email" || i.path[0] === "phone");
  return issue ? new HttpError(400, issue.message, String(issue.path[0])) : null;
}

export const bookingSchema = z.object({
  packageId: z.enum(bookablePackages),
  vehicleSize: z.enum(["small", "medium", "large"]),
  addOnIds: z.array(z.enum(["windshield", "glass", "headlight", "engine"])).max(4).refine(v => new Set(v).size === v.length),
  date: isoDay.refine(bookableDay),
  time: z.enum(bookingTimes), name: text(2, 100),
  email: contactEmail,
  phone: contactPhone,
  vehicle: text(3, 120), address: text(8, 250), turnstileToken: z.string().min(1).max(2048),
  // The Terms of Service version the customer ticked to accept (lib/terms.ts).
  acceptedTerms: z.string().max(20),
}).strict();
const email = z.string().trim().email().max(254).transform(v => v.toLowerCase());
const bookingCode = z.string().trim().toUpperCase().regex(/^CAM-[A-F0-9]{12}$/);
// My appointments: ask for a sign-in code, then exchange it (or the link from the
// confirmation email) for a short session.
export const codeRequestSchema = z.object({ email, turnstileToken: z.string().min(1).max(2048) }).strict();
export const signInSchema = z.union([
  z.object({ email, code: z.string().trim().regex(/^\d{6}$/) }).strict(),
  z.object({ access: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]);
export const customerCancelSchema = z.object({ code: bookingCode }).strict();
export const availabilitySchema = z.object({
  from: isoDay,
  days: z.coerce.number().int().min(1).max(62),
});
export const decisionSchema = z.object({
  code: bookingCode,
  action: z.enum(["view", "cancel"]),
}).strict();
export const quoteSchema = z.object({
  service: z.enum(Object.keys(quoteServices) as [keyof typeof quoteServices, ...(keyof typeof quoteServices)[]]),
  vehicle: text(3, 120),
  name: text(2, 100),
  email: contactEmail,
  phone: contactPhone,
  timing: text(0, 200).optional().default(""),
  notes: text(0, 1500).optional().default(""),
  turnstileToken: z.string().min(1).max(2048),
}).strict();
export function estimate(input: z.infer<typeof bookingSchema>) {
  const service = prices[input.packageId];
  // An add-on the package already includes (engine bay cleaning in Premium) isn't charged twice.
  const addOnIds = input.addOnIds.filter(id => !includedAddOns[input.packageId]?.includes(id));
  return { packageName: `${service.name} · ${input.vehicleSize}`, addOns: addOnIds.map(id => extras[id][0]).join(", "),
    total: service[input.vehicleSize] + addOnIds.reduce((n, id) => n + extras[id][1], 0) };
}
