import { z } from "zod";
import { prices, extras, bookingTimes } from "./booking-catalog";
const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
export function chicagoDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export const bookingSchema = z.object({
  packageId: z.enum(["full", "premium", "maintenance", "ceramic3", "ceramic5"]),
  vehicleSize: z.enum(["small", "medium", "large"]),
  addOnIds: z.array(z.enum(["windshield", "glass", "headlight", "engine"])).max(4).refine(v => new Set(v).size === v.length),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
    const timestamp = Date.parse(`${v}T12:00:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === v &&
      v > chicagoDay() && timestamp < Date.now() + 181 * 86400000;
  }),
  time: z.enum(bookingTimes), name: text(2, 100),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  phone: z.string().max(30).transform(v => v.replace(/[ ()+.-]/g, "")).refine(v => /^(1)?[2-9]\d{9}$/.test(v)).transform(v => `+${v.length === 10 ? "1" : ""}${v}`),
  vehicle: text(3, 120), address: text(8, 250), turnstileToken: z.string().min(1).max(2048),
}).strict();
export const recoverySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^CAM-[A-F0-9]{12}$/),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  turnstileToken: z.string().min(1).max(2048),
}).strict();
export function estimate(input: z.infer<typeof bookingSchema>) {
  const service = prices[input.packageId];
  return { packageName: `${service.name} · ${input.vehicleSize}`, addOns: input.addOnIds.map(id => extras[id][0]).join(", "),
    total: service[input.vehicleSize] + input.addOnIds.reduce((n, id) => n + extras[id][1], 0) };
}
