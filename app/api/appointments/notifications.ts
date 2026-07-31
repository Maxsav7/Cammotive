type Booking = {
  confirmationCode: string;
  packageName: string;
  addOns: string;
  date: string;
  time: string;
  total: string;
  name: string;
  email: string;
  phone: string;
  vehicle: string;
  address: string;
};

type DeliveryResult = {
  customerEmail: boolean;
  customerText: boolean;
  businessEmail: boolean;
  businessText: boolean;
  configured: boolean;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

function prettyDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago",
  }).format(new Date(`${value}T12:00:00-05:00`));
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return value.startsWith("+") ? value : `+${digits}`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BOOKING_FROM_EMAIL;
  if (!apiKey || !from || !to) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  return response.ok;
}

async function sendText(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !from || !to) return false;
  const params = new URLSearchParams({ To: normalizePhone(to), From: from, Body: body });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  return response.ok;
}

function emailShell(title: string, intro: string, booking: Booking) {
  const details = [
    ["Confirmation", booking.confirmationCode],
    ["Service", booking.packageName],
    ["Date & time", `${prettyDate(booking.date)} at ${booking.time}`],
    ["Vehicle", booking.vehicle],
    ["Address", booking.address],
    ["Estimated total", `$${booking.total}`],
  ];
  return `<!doctype html><html><body style="margin:0;background:#090a0c;color:#f5f4f6;font-family:Arial,sans-serif">
    <div style="max-width:620px;margin:auto;padding:42px 24px">
      <div style="font-weight:800;letter-spacing:4px;font-size:18px">CAMOTIVE <span style="color:#9c6bff">DETAILING</span></div>
      <div style="margin-top:30px;padding:34px;background:#131419;border:1px solid #302b38;border-top:3px solid #9c6bff">
        <p style="color:#9c6bff;text-transform:uppercase;letter-spacing:2px;font-size:11px;margin:0">Booking confirmed</p>
        <h1 style="font-size:30px;margin:12px 0">${escapeHtml(title)}</h1>
        <p style="color:#aaa7af;line-height:1.6">${escapeHtml(intro)}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:24px">
          ${details.map(([label, value]) => `<tr><td style="padding:11px 0;border-top:1px solid #302e36;color:#817e87;font-size:12px">${label}</td><td style="padding:11px 0;border-top:1px solid #302e36;text-align:right;font-weight:bold">${escapeHtml(value)}</td></tr>`).join("")}
        </table>
      </div>
      <p style="color:#77747d;font-size:12px;line-height:1.6">Questions or changes? Call or text Camotive Detailing at (210) 573-0671.</p>
    </div>
  </body></html>`;
}

export async function sendBookingNotifications(booking: Booking): Promise<DeliveryResult> {
  const camEmail = process.env.CAM_BOOKING_EMAIL ?? "";
  const camPhone = process.env.CAM_BOOKING_PHONE ?? "+12105730671";
  const dateAndTime = `${prettyDate(booking.date)} at ${booking.time}`;
  const customerText = `Thank you for booking Camotive Detailing, ${booking.name}! Your ${booking.packageName} is confirmed for ${dateAndTime}. Confirmation: ${booking.confirmationCode}. Questions? Call (210) 573-0671.`;
  const camText = `New Camotive booking: ${booking.name}, ${booking.packageName}, ${booking.vehicle}, ${dateAndTime}, ${booking.address}. Est. $${booking.total}. Customer: ${booking.phone}. Code: ${booking.confirmationCode}`;

  const [customerEmail, customerTextSent, businessEmail, businessText] = await Promise.allSettled([
    sendEmail(booking.email, `Your Camotive appointment is confirmed — ${booking.confirmationCode}`, emailShell(`Thanks for booking, ${booking.name}.`, "Your detail is officially on the calendar. We look forward to making your vehicle stand out.", booking)),
    sendText(booking.phone, customerText),
    sendEmail(camEmail, `New booking: ${booking.name} — ${dateAndTime}`, emailShell("A new detail has been booked.", `${booking.name} just scheduled a ${booking.packageName}. Contact: ${booking.phone} · ${booking.email}`, booking)),
    sendText(camPhone, camText),
  ]);

  return {
    customerEmail: customerEmail.status === "fulfilled" && customerEmail.value,
    customerText: customerTextSent.status === "fulfilled" && customerTextSent.value,
    businessEmail: businessEmail.status === "fulfilled" && businessEmail.value,
    businessText: businessText.status === "fulfilled" && businessText.value,
    configured: Boolean(process.env.RESEND_API_KEY && process.env.BOOKING_FROM_EMAIL && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER && camEmail),
  };
}
