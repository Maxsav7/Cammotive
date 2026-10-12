// Plain-text emails. Each one states the booking's status in its first line so a
// customer never mistakes a request for a confirmed appointment.
import type { Email } from "./booking-outbox";
import { configuredOrigin } from "./booking-security";
import { appointmentIcs, toBase64 } from "./calendar";
import { depositPercent, type bookingTimes } from "./booking-catalog";

type Slot = (typeof bookingTimes)[number];
export type BookingDetails = {
  packageName: string; addOns: string; total: number; date: string; time: Slot;
  name: string; email: string; phone: string; vehicle: string; address: string;
};

const PHONE = "(210) 573-0671";
export function longDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
const firstName = (name: string) => name.trim().split(/\s+/)[0];
const summary = (d: BookingDetails) =>
  `${d.packageName}${d.addOns ? ` + ${d.addOns}` : ""}\n${longDate(d.date)} at ${d.time}\n${d.vehicle}\n${d.address}\nEstimate: $${d.total} (final price confirmed before work begins)`;
const beforeWeArrive = `Before we arrive: please have an outdoor water connection and a power outlet within reach of the vehicle, and make sure we can access the parking spot (gate codes, HOA or apartment permission).\nA ${depositPercent}% deposit is collected on site before work begins.`;

export function accessEmail(code: string, email: string, accessToken: string): Email {
  // The token travels in the URL fragment, which is never sent to servers or logged.
  const link = `${configuredOrigin()}/appointment#access=${accessToken}`;
  return { to: email, subject: "Your Camotive appointment link", text:
    `Your reference is ${code}. Open your private appointment link (expires in 24 hours):\n${link}\n\nDo not forward this link. If you did not request this, ignore it. Questions? ${PHONE}.` };
}

export function requestReceivedEmail(code: string, d: BookingDetails, accessToken: string): Email {
  const link = `${configuredOrigin()}/appointment#access=${accessToken}`;
  return { to: d.email, subject: `Request received: ${longDate(d.date)} at ${d.time}`, text:
`Hi ${firstName(d.name)},

Your request is in. This is not a confirmation yet: we review every request and will email you as soon as it's confirmed. Your time slot is held for you in the meantime.

${summary(d)}

Reference: ${code}
Check your request (link expires in 24 hours): ${link}

${beforeWeArrive}

Questions or changes? Call or text ${PHONE}.
Camotive Detailing` };
}

export function camRequestEmail(code: string, d: BookingDetails, adminToken: string): Email {
  const link = `${configuredOrigin()}/manage#booking=${code}&token=${adminToken}`;
  return { to: process.env.CAM_BOOKING_EMAIL!, subject: `New request: ${d.packageName}, ${longDate(d.date)} ${d.time}`, text:
`New booking request ${code}. The slot is held until you approve or decline it.

${summary(d)}

${d.name}
${d.phone}
${d.email}

Approve or decline: ${link}
(Keep this link private. It opens this request only.)` };
}

export function confirmedEmail(code: string, d: BookingDetails): Email {
  return { to: d.email, subject: `Confirmed: ${longDate(d.date)} at ${d.time}`, text:
`Hi ${firstName(d.name)},

You're confirmed. We'll arrive at ${d.time} on ${longDate(d.date)}.

${summary(d)}

Reference: ${code}
The attached calendar invite adds the appointment to your calendar. You'll also get a reminder email the day before.

${beforeWeArrive}

Need to change something? Call or text ${PHONE}.
Camotive Detailing`,
    attachments: [{ filename: "camotive-appointment.ics", contentType: "text/calendar", content: toBase64(appointmentIcs({ code, date: d.date, time: d.time, service: d.packageName, address: d.address })) }] };
}

export function declinedEmail(code: string, d: BookingDetails): Email {
  return { to: d.email, subject: `We can't take ${longDate(d.date)} at ${d.time}`, text:
`Hi ${firstName(d.name)},

We aren't able to take your requested time (${longDate(d.date)} at ${d.time}), so this request (${code}) is not booked and the time has been released.

Please choose another time at ${configuredOrigin()}/book, or call or text ${PHONE} and we'll find one with you.

Camotive Detailing` };
}

export function reminderEmail(code: string, d: BookingDetails): Email {
  return { to: d.email, subject: `Reminder: Camotive detail tomorrow at ${d.time}`, text:
`Hi ${firstName(d.name)},

A reminder that we arrive tomorrow, ${longDate(d.date)}, at ${d.time}.

${summary(d)}

Reference: ${code}

${beforeWeArrive}

Running late or need to reschedule? Call or text ${PHONE}.
Camotive Detailing` };
}

export type QuoteDetails = { service: string; vehicle: string; name: string; email: string; phone: string; timing: string; notes: string };
export function camQuoteEmail(reference: string, q: QuoteDetails): Email {
  return { to: process.env.CAM_BOOKING_EMAIL!, subject: `Quote request: ${q.service}, ${q.vehicle}`, text:
`Quote request ${reference}

Service: ${q.service}
Vehicle: ${q.vehicle}
Preferred timing: ${q.timing || "Not given"}

${q.notes || "No notes."}

${q.name}
${q.phone}
${q.email}

Reply to the customer by email or text. They were asked to text photos of the vehicle to ${PHONE}.` };
}
export function quoteReceivedEmail(reference: string, q: QuoteDetails): Email {
  return { to: q.email, subject: `Quote request received: ${q.service}`, text:
`Hi ${firstName(q.name)},

Thanks, we have your ${q.service.toLowerCase()} request for your ${q.vehicle} and will reply within one business day.

Photos help us quote accurately: text a few clear photos of the vehicle in daylight to ${PHONE} and mention reference ${reference}.

Camotive Detailing` };
}
