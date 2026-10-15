"use client";
// Cam's private page for one booking, opened from the new-booking email. He can
// see the details and cancel the booking (after a confirm step).
// The token is in the URL fragment (never sent to servers or logs) and is removed
// from the address bar immediately.
import { useEffect, useState } from "react";

type Booking = { code: string; date: string; time: string; status: string; packageName: string; addOns: string; total: number; name: string; email: string; phone: string; vehicle: string; address: string };
const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export default function ManageBooking() {
  const [auth, setAuth] = useState<{ code: string; token: string } | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [message, setMessage] = useState("Loading…");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function call(action: "view" | "cancel", a = auth) {
    if (!a) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/booking", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.token}` }, body: JSON.stringify({ code: a.code, action }), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "Something went wrong."); return; }
      setBooking(result.booking);
      setConfirming(false);
      setMessage(action === "cancel" ? "Cancelled. The customer has been emailed and the time is open again." : "");
    } catch { setMessage("Connection interrupted. Try again."); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const code = params.get("booking") ?? "", token = params.get("token") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    if (!/^CAM-[A-F0-9]{12}$/.test(code) || !/^[a-f0-9]{64}$/.test(token)) { queueMicrotask(() => setMessage("Open this page from the link in your booking email.")); return; }
    const a = { code, token };
    queueMicrotask(() => { setAuth(a); call("view", a); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <section className="section manage">
    <div className="section-heading"><p className="eyebrow">Booking</p><h1>{booking ? `${booking.packageName}` : "Your booking"}</h1></div>
    {booking && <div className="manage-card">
      <p className={`status-pill status-${booking.status}`}>{booking.status === "confirmed" ? "Confirmed" : booking.status === "cancelled" ? "Cancelled" : booking.status === "pending" ? "Waiting for confirmation" : booking.status === "declined" ? "Declined" : booking.status}</p>
      <dl className="review-list">
        <div><dt>When</dt><dd>{fmt(booking.date)}, {booking.time}</dd></div>
        <div><dt>Service</dt><dd>{booking.packageName}{booking.addOns ? ` + ${booking.addOns}` : ""}, estimate ${booking.total}</dd></div>
        <div><dt>Vehicle</dt><dd>{booking.vehicle}</dd></div>
        <div><dt>Address</dt><dd>{booking.address}</dd></div>
        <div><dt>Customer</dt><dd>{booking.name}<br /><a href={`tel:${booking.phone}`}>{booking.phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")}</a> · <a href={`mailto:${booking.email}`}>{booking.email}</a></dd></div>
        <div><dt>Reference</dt><dd>{booking.code}</dd></div>
      </dl>
      {(booking.status === "confirmed" || booking.status === "pending") && (confirming
        ? <div className="manage-confirm" role="group" aria-label="Cancel this booking?">
          <p>Cancel this booking? {booking.name.split(" ")[0]} gets an email saying it&apos;s cancelled, and the time opens up for someone else.</p>
          <div className="hero-actions">
            <button className="button danger-button" type="button" disabled={busy} onClick={() => call("cancel")}>{busy ? "Cancelling…" : "Yes, cancel it"}</button>
            <button className="outline-button" type="button" disabled={busy} onClick={() => setConfirming(false)}>Keep booking</button>
          </div>
        </div>
        : <div className="hero-actions"><a className="button" href={`tel:${booking.phone}`}>Call {booking.name.split(" ")[0]}</a>
          <button className="outline-button" type="button" disabled={busy} onClick={() => setConfirming(true)}>Cancel booking</button></div>)}
    </div>}
    {message && <p className="manage-message" role="status">{message}</p>}
  </section>;
}
