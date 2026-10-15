// Booking emails. Each one has a branded HTML version and a plain-text version
// with the same content, and states the booking's status first so it can't be
// misread. Everything a customer typed is HTML-escaped before it goes into markup.
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
const PHONE_LINK = "tel:+12105730671";
export function longDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
// Stored as +1XXXXXXXXXX; shown the way people write it.
const prettyPhone = (phone: string) => phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
const firstName = (name: string) => name.trim().split(/\s+/)[0];
const service = (d: BookingDetails) => `${d.packageName}${d.addOns ? ` + ${d.addOns}` : ""}`;
const summary = (d: BookingDetails) =>
  `${service(d)}\n${longDate(d.date)} at ${d.time}\n${d.vehicle}\n${d.address}\nEstimate: $${d.total} (final price confirmed before work begins)`;
const arrivalNotes = [
  "Please have an outdoor water connection and a power outlet within reach of the vehicle.",
  "Make sure we can reach the parking spot (gate codes, HOA or apartment permission).",
  `A ${depositPercent}% deposit is collected on site before work begins.`,
];
const beforeWeArrive = `Before we arrive: ${arrivalNotes.join(" ")}`;
const detailRows = (d: BookingDetails, code: string): Row[] => [
  ["When", `${longDate(d.date)}\n${d.time}`], ["Service", service(d)], ["Vehicle", d.vehicle],
  ["Address", d.address], ["Estimate", `$${d.total}, final price confirmed before we start`], ["Reference", code],
];
const invite = (code: string, d: BookingDetails, cancelled = false) => ({
  filename: cancelled ? "camotive-cancelled.ics" : "camotive-appointment.ics", contentType: "text/calendar",
  content: toBase64(appointmentIcs({ code, date: d.date, time: d.time, service: d.packageName, address: d.address, cancelled })),
});

// ---------------------------------------------------------------------------
// Branded layout: table-based with inline styles, which is what email clients
// render reliably. Graphite card, chrome logo, one light pill button.
// ---------------------------------------------------------------------------
type Row = [label: string, value: string];
type Tone = "confirmed" | "cancelled" | "info";
type Layout = {
  subject: string; preheader: string; status?: { label: string; tone: Tone }; heading: string;
  paragraphs: string[]; rows?: Row[]; button?: { label: string; href: string }; after?: string[];
  notes?: { title: string; items: string[] };
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const lines = (value: string) => escapeHtml(value).replace(/\n/g, "<br>");
const FONT = "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const dot = { confirmed: "#7bd88f", cancelled: "#ff9b8f", info: "#b9addf" } as const;

export function renderEmail(l: Layout) {
  const origin = configuredOrigin() ?? "";
  const p = (text: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#d4d3dc;">${lines(text)}</p>`;
  const status = l.status ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr><td style="border:1px solid #3a3943;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600;color:#ededf2;font-family:${FONT};"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot[l.status.tone]};margin-right:8px;vertical-align:1px;"></span>${escapeHtml(l.status.label)}</td></tr></table>` : "";
  const rows = l.rows?.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-top:1px solid #2b2a33;">${l.rows.map(([label, value]) =>
    `<tr><td valign="top" style="padding:12px 12px 12px 0;border-bottom:1px solid #2b2a33;width:96px;font-size:12px;line-height:1.5;letter-spacing:0.08em;text-transform:uppercase;color:#a3a2ae;font-family:${FONT};">${escapeHtml(label)}</td><td valign="top" style="padding:12px 0;border-bottom:1px solid #2b2a33;font-size:15px;line-height:1.5;color:#ededf2;font-family:${FONT};">${lines(value)}</td></tr>`).join("")}</table>` : "";
  const button = l.button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;"><tr><td style="border-radius:999px;background:#ededf2;"><a href="${escapeHtml(l.button.href)}" style="display:inline-block;padding:14px 26px;border-radius:999px;font-size:15px;font-weight:700;color:#131218;text-decoration:none;font-family:${FONT};">${escapeHtml(l.button.label)}</a></td></tr></table>` : "";
  const notes = l.notes ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr><td style="background:#1f1e26;border-radius:12px;padding:18px 20px;font-family:${FONT};"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#ededf2;">${escapeHtml(l.notes.title)}</p>${l.notes.items.map(item => `<p style="margin:0 0 6px;font-size:14px;line-height:1.55;color:#c9c8d2;">${lines(item)}</p>`).join("")}</td></tr></table>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escapeHtml(l.subject)}</title></head>
<body style="margin:0;padding:0;background:#121117;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#121117;">${escapeHtml(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121117;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 22px;"><a href="${escapeHtml(origin || "#")}" style="text-decoration:none;"><img src="${escapeHtml(origin)}/brand/camotive-email-logo.png" width="200" height="50" alt="Camotive Detailing" style="display:block;border:0;color:#ededf2;font-family:${FONT};font-size:20px;font-weight:800;"></a></td></tr>
<tr><td style="background:#19181f;border:1px solid #2b2a33;border-radius:18px;padding:32px 28px 24px;font-family:${FONT};">
${status}<h1 style="margin:0 0 14px;font-size:26px;line-height:1.2;font-weight:800;color:#ffffff;font-family:${FONT};">${escapeHtml(l.heading)}</h1>
${l.paragraphs.map(p).join("\n")}
${rows}${button}${(l.after ?? []).map(p).join("\n")}${notes}
</td></tr>
<tr><td style="padding:22px 4px 0;font-size:13px;line-height:1.6;color:#8d8c98;font-family:${FONT};">Camotive Detailing · Mobile detailing across San Antonio<br>Questions or changes? Call or text <a href="${PHONE_LINK}" style="color:#ededf2;text-decoration:underline;">${PHONE}</a></td></tr>
</table></td></tr></table>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Customer emails
// ---------------------------------------------------------------------------
export function accessEmail(code: string, email: string, accessToken: string): Email {
  // The token travels in the URL fragment, which is never sent to servers or logged.
  const link = `${configuredOrigin()}/appointment#access=${accessToken}`;
  const subject = "Your Camotive appointment link";
  return { to: email, subject, text:
    `Your reference is ${code}. Open your private appointment link (expires in 24 hours):\n${link}\n\nDo not forward this link. If you did not request this, ignore it. Questions? ${PHONE}.`,
  html: renderEmail({ subject, preheader: `Private link for ${code}`, heading: "Your appointment link",
    paragraphs: [`Your reference is ${code}. This private link shows your appointment and expires in 24 hours.`],
    button: { label: "View my appointment", href: link }, after: ["Please don't forward this email. If you didn't ask for it, you can ignore it."] }) };
}

export function bookedEmail(code: string, d: BookingDetails, accessToken: string): Email {
  const link = `${configuredOrigin()}/appointment#access=${accessToken}`;
  const subject = `Booked: ${longDate(d.date)} at ${d.time}`;
  return { to: d.email, subject, text:
`Hi ${firstName(d.name)},

You're booked. We'll arrive at ${d.time} on ${longDate(d.date)}.

${summary(d)}

Reference: ${code}
The attached invite adds the appointment to your calendar, and you'll get a reminder the day before.
View your appointment (link expires in 24 hours): ${link}

${beforeWeArrive}

Need to change something? Call or text ${PHONE}.
Camotive Detailing`,
    html: renderEmail({ subject, preheader: `We arrive ${d.time}, ${longDate(d.date)}. Reference ${code}.`,
      status: { label: "Confirmed", tone: "confirmed" }, heading: `You're booked, ${firstName(d.name)}.`,
      paragraphs: [`We'll arrive at ${d.time} on ${longDate(d.date)}. The attached invite adds it to your calendar, and we'll send a reminder the day before.`],
      rows: detailRows(d, code), button: { label: "View my appointment", href: link },
      after: ["The appointment link works for 24 hours. Need to change something? Call or text us."],
      notes: { title: "Before we arrive", items: arrivalNotes } }),
    attachments: [invite(code, d)] };
}

export function cancelledEmail(code: string, d: BookingDetails): Email {
  const subject = `Cancelled: ${longDate(d.date)} at ${d.time}`;
  const book = `${configuredOrigin()}/book`;
  return { to: d.email, subject, text:
`Hi ${firstName(d.name)},

We're sorry, we've had to cancel your appointment on ${longDate(d.date)} at ${d.time} (${code}). Nothing is owed.

Please choose another time at ${book}, or call or text ${PHONE} and we'll find one with you.

Camotive Detailing`,
    html: renderEmail({ subject, preheader: `Your ${longDate(d.date)} appointment is cancelled.`,
      status: { label: "Cancelled", tone: "cancelled" }, heading: "Your appointment is cancelled",
      paragraphs: [`Hi ${firstName(d.name)}, we're sorry, we've had to cancel your appointment on ${longDate(d.date)} at ${d.time} (${code}). Nothing is owed.`,
        "Pick another time online, or call or text us and we'll find one with you."],
      button: { label: "Choose another time", href: book } }),
    attachments: [invite(code, d, true)] };
}

export function reminderEmail(code: string, d: BookingDetails): Email {
  const subject = `Reminder: Camotive detail tomorrow at ${d.time}`;
  return { to: d.email, subject, text:
`Hi ${firstName(d.name)},

A reminder that we arrive tomorrow, ${longDate(d.date)}, at ${d.time}.

${summary(d)}

Reference: ${code}

${beforeWeArrive}

Running late or need to reschedule? Call or text ${PHONE}.
Camotive Detailing`,
    html: renderEmail({ subject, preheader: `We arrive tomorrow at ${d.time}.`, status: { label: "Tomorrow", tone: "confirmed" },
      heading: `See you tomorrow at ${d.time}`, paragraphs: [`Hi ${firstName(d.name)}, a reminder that we arrive tomorrow, ${longDate(d.date)}, at ${d.time}.`],
      rows: detailRows(d, code), notes: { title: "Before we arrive", items: arrivalNotes },
      after: ["Running late or need to reschedule? Call or text us."] }) };
}

// ---------------------------------------------------------------------------
// Emails to Cam
// ---------------------------------------------------------------------------
export function camBookingEmail(code: string, d: BookingDetails, adminToken: string): Email {
  const link = `${configuredOrigin()}/manage#booking=${code}&token=${adminToken}`;
  const subject = `New booking: ${d.packageName}, ${longDate(d.date)} ${d.time}`;
  return { to: process.env.CAM_BOOKING_EMAIL!, subject, text:
`New booking ${code}. It's confirmed and the customer has their confirmation.

${summary(d)}

${d.name}
${d.phone}
${d.email}

The attached invite adds it to your calendar (it's added automatically if Google Calendar sync is set up).
View or cancel: ${link}
(Keep this link private. It opens this booking only.)`,
    html: renderEmail({ subject, preheader: `${d.name}, ${d.vehicle}. ${longDate(d.date)} at ${d.time}.`,
      status: { label: "Confirmed", tone: "confirmed" }, heading: `New booking: ${d.packageName}`,
      paragraphs: ["It's confirmed and the customer has their confirmation email."],
      rows: [...detailRows(d, code).slice(0, 5), ["Customer", `${d.name}\n${prettyPhone(d.phone)}\n${d.email}`], ["Reference", code]],
      button: { label: "View or cancel", href: link },
      after: ["Keep this link private. It opens this booking only. The attached invite adds it to your calendar if Google Calendar sync isn't set up."] }),
    attachments: [invite(code, d)] };
}

export type QuoteDetails = { service: string; vehicle: string; name: string; email: string; phone: string; timing: string; notes: string };
export function camQuoteEmail(reference: string, q: QuoteDetails): Email {
  const subject = `Quote request: ${q.service}, ${q.vehicle}`;
  return { to: process.env.CAM_BOOKING_EMAIL!, subject, text:
`Quote request ${reference}

Service: ${q.service}
Vehicle: ${q.vehicle}
Preferred timing: ${q.timing || "Not given"}

${q.notes || "No notes."}

${q.name}
${q.phone}
${q.email}

Reply to the customer by email or text. They were asked to text photos of the vehicle to ${PHONE}.`,
    html: renderEmail({ subject, preheader: `${q.name}, ${q.vehicle}`, status: { label: "Quote request", tone: "info" }, heading: `${q.service} quote`,
      paragraphs: [q.notes || "No notes."],
      rows: [["Vehicle", q.vehicle], ["Timing", q.timing || "Not given"], ["Customer", `${q.name}\n${q.phone}\n${q.email}`], ["Reference", reference]],
      after: [`Reply by email or text. They were asked to text photos of the vehicle to ${PHONE}.`] }) };
}
export function quoteReceivedEmail(reference: string, q: QuoteDetails): Email {
  const subject = `Quote request received: ${q.service}`;
  return { to: q.email, subject, text:
`Hi ${firstName(q.name)},

Thanks, we have your ${q.service.toLowerCase()} request for your ${q.vehicle} and will reply within one business day.

Photos help us quote accurately: text a few clear photos of the vehicle in daylight to ${PHONE} and mention reference ${reference}.

Camotive Detailing`,
    html: renderEmail({ subject, preheader: "We reply within one business day.", status: { label: "Received", tone: "info" },
      heading: `Thanks, ${firstName(q.name)}.`,
      paragraphs: [`We have your ${q.service.toLowerCase()} request for your ${q.vehicle} and will reply within one business day.`,
        `Photos help us quote accurately: text a few clear photos of the vehicle in daylight to ${PHONE} and mention reference ${reference}.`],
      button: { label: "Text us photos", href: "sms:+12105730671" } }) };
}
