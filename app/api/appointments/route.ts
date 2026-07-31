import { env } from "cloudflare:workers";

type AppointmentInput = {
  packageId: string; packageName: string; addOns: string; date: string; time: string;
  total: string; name: string; email: string; phone: string; vehicle: string;
  address: string; reminder: string;
};

async function ensureTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    confirmation_code TEXT NOT NULL UNIQUE,
    package_id TEXT NOT NULL,
    package_name TEXT NOT NULL,
    add_ons TEXT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    total INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    vehicle TEXT NOT NULL,
    address TEXT NOT NULL,
    reminder TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function POST(request: Request) {
  const data = await request.json() as AppointmentInput;
  if (!data.name || !data.email || !data.phone || !data.date || !data.time) {
    return Response.json({ error: "Missing required booking details" }, { status: 400 });
  }
  await ensureTable();
  const confirmationCode = `CAM-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  await env.DB.prepare(`INSERT INTO appointments
    (confirmation_code, package_id, package_name, add_ons, date, time, total, name, email, phone, vehicle, address, reminder)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(confirmationCode, data.packageId, data.packageName, data.addOns, data.date, data.time, Number(data.total), data.name, data.email, data.phone, data.vehicle, data.address, data.reminder)
    .run();
  return Response.json({ confirmationCode });
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase();
  if (!code) return Response.json({ error: "Confirmation code required" }, { status: 400 });
  await ensureTable();
  const appointment = await env.DB.prepare(`SELECT confirmation_code, package_name, add_ons, date, time, total, name, vehicle, address, reminder
    FROM appointments WHERE confirmation_code = ?`).bind(code).first();
  return Response.json({ appointment });
}
