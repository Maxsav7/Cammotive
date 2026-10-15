// Calendar invite (.ics) for a confirmed appointment. Times are Chicago local,
// converted to UTC so every calendar app places the event correctly.
import { slotHours, slotStart, type bookingTimes } from "./booking-catalog";

type Slot = (typeof bookingTimes)[number];

// Offset of America/Chicago from UTC (in minutes) at a given instant.
function chicagoOffsetMinutes(instant: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(instant).map(p => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

export function slotToUtc(date: string, time: Slot) {
  const [hour, minute] = slotStart[time].split(":").map(Number);
  const guess = new Date(`${date}T${slotStart[time]}:00Z`);
  const offset = chicagoOffsetMinutes(guess);
  const utc = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hour, minute) - offset * 60000);
  return utc;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (v: string) => v.replace(/\\/g, "\\\\").replace(/[;,]/g, m => `\\${m}`).replace(/\r?\n/g, "\\n");

// A cancelled invite reuses the UID with a higher SEQUENCE, so calendar apps that
// imported the original can match it and mark that event cancelled.
export function appointmentIcs({ code, date, time, service, address, cancelled = false }: { code: string; date: string; time: Slot; service: string; address: string; cancelled?: boolean }) {
  const start = slotToUtc(date, time);
  const end = new Date(start.getTime() + slotHours * 3600000);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Camotive Detailing//Booking//EN", "CALSCALE:GREGORIAN", cancelled ? "METHOD:CANCEL" : "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${code}@camotive`,
    `SEQUENCE:${cancelled ? 1 : 0}`,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(`${cancelled ? "Cancelled: " : ""}Camotive mobile detail: ${service}`)}`,
    `LOCATION:${escape(address)}`,
    `DESCRIPTION:${escape(`Reference ${code}. We arrive at ${time}. Please have water and power within reach. A 10% deposit is collected on site before work begins. Questions: (210) 573-0671.`)}`,
    ...(cancelled ? [] : ["BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Camotive detail tomorrow", "END:VALARM"]),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

export function toBase64(text: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}
