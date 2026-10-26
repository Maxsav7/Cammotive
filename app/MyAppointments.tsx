"use client";
// My appointments: the customer enters the email they booked with, gets a 6-digit
// code, and then sees every booking made with that email. Upcoming bookings can be
// cancelled (the deposit is non-refundable). The private link in the confirmation
// email signs them in directly. The session token lives only in this browser tab.
import { FormEvent, useCallback, useEffect, useState } from "react";
import BookingChallenge from "./BookingChallenge";
import { depositDollars, slotLabel } from "../lib/booking-catalog";

type Appointment = {
  code: string; date: string; time: string; status: "confirmed" | "cancelled"; upcoming: boolean; canCancel: boolean;
  packageName: string; addOns: string; total: number; vehicle: string; address: string; deposit: number;
  cancelledBy: "customer" | "camotive" | null; refunded: boolean;
};
type Status = { enabled: boolean; siteKey?: string | null };

const PHONE = "(210) 573-0671";
const KEY = "camotive-session";
const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const storeSession = (value: string | null) => { try { if (value) sessionStorage.setItem(KEY, value); else sessionStorage.removeItem(KEY); } catch {} };
const savedSession = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const post = (url: string, body: unknown, session?: string) => fetch(url, { method: "POST", cache: "no-store",
  headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) }, body: JSON.stringify(body) });

export default function MyAppointments() {
  const [status, setStatus] = useState<Status | null>(null);
  const [stage, setStage] = useState<"email" | "code" | "list">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [session, setSession] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [botToken, setBotToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);

  const signOut = useCallback((note = "") => { storeSession(null); setSession(null); setAppointments(null); setStage("email"); setMessage(note); }, []);

  const loadList = useCallback(async (token: string) => {
    const response = await fetch("/api/account/appointments", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = await response.json();
    if (response.status === 401) { signOut(result.error); return; }
    if (!response.ok) { setMessage(result.error || `Something went wrong. Please call ${PHONE}.`); return; }
    setAppointments(result.appointments); setStage("list");
  }, [signOut]);

  const startSession = useCallback(async (token: string) => { storeSession(token); setSession(token); await loadList(token); }, [loadList]);

  // Signs in from the confirmation email's private link (#access=…). Also runs when
  // that link is opened while this page is already showing (only the hash changes).
  const signInFromLink = useCallback(async () => {
    const access = new URLSearchParams(window.location.hash.slice(1)).get("access");
    if (!access) return false;
    window.history.replaceState(null, "", window.location.pathname); // the token never stays in the address bar
    if (!/^[a-f0-9]{64}$/.test(access)) return false;
    const response = await post("/api/account/session", { access }).catch(() => null);
    const result = await response?.json().catch(() => ({}));
    if (response?.ok) { await startSession(result.session); return true; }
    setMessage(result?.error || "This link has expired. Enter your email to get a sign-in code.");
    return true;
  }, [startSession]);

  useEffect(() => {
    fetch("/api/appointments/status", { cache: "no-store" }).then(r => r.json()).then(setStatus).catch(() => setStatus({ enabled: false }));
    queueMicrotask(async () => {
      if (await signInFromLink()) return;
      const saved = savedSession();
      if (saved) await loadList(saved).then(() => setSession(saved)).catch(() => {});
    });
    const onHash = () => { signInFromLink(); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [loadList, signInFromLink]);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    if (busy || !botToken) return;
    setBusy(true); setMessage("");
    try {
      const response = await post("/api/account/code", { email, turnstileToken: botToken });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || `Couldn't send a code. Please call ${PHONE}.`); return; }
      setStage("code"); setCode(""); setMessage(result.message);
    } catch { setMessage("Connection interrupted. Please try again."); }
    finally { setBusy(false); setBotToken(""); setChallenge(v => v + 1); }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await post("/api/account/session", { email, code });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "That code isn't right."); return; }
      await startSession(result.session); setMessage("");
    } catch { setMessage("Connection interrupted. Please try again."); }
    finally { setBusy(false); }
  }

  async function cancel(target: string) {
    if (!session || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await post("/api/account/appointments", { code: target }, session);
      const result = await response.json();
      if (response.status === 401) { signOut(result.error); return; }
      if (!response.ok) { setMessage(result.error || `Couldn't cancel. Please call ${PHONE}.`); return; }
      setCancelling(null);
      setMessage(`Cancelled. We've emailed you a confirmation, and the time is open for someone else.`);
      await loadList(session);
    } catch { setMessage("Connection interrupted. Please try again."); }
    finally { setBusy(false); }
  }

  if (!status) return <section className="section my-appointments"><p>Loading…</p></section>;
  if (!status.enabled) return <section className="section my-appointments"><div className="booking-panel">
    <p>Online appointments are temporarily unavailable. Call or text us to check or change a booking.</p><a className="button" href="tel:+12105730671">Call {PHONE}</a></div></section>;

  const upcoming = appointments?.filter(a => a.status === "confirmed" && a.upcoming) ?? [];
  const past = appointments?.filter(a => !(a.status === "confirmed" && a.upcoming)) ?? [];
  const card = (a: Appointment) => <article key={a.code} className="appointment-card" aria-labelledby={`${a.code}-title`}>
    <div className="appointment-card-head">
      <p className={`status-pill status-${a.status === "confirmed" ? (a.upcoming ? "confirmed" : "past") : "cancelled"}`}>
        {a.status === "cancelled" ? "Cancelled" : a.upcoming ? "Confirmed" : "Completed"}</p>
      <small>{a.code}</small>
    </div>
    <h3 id={`${a.code}-title`}>{fmt(a.date)}, {slotLabel[a.time] ?? a.time}</h3>
    <dl>
      <div><dt>Service</dt><dd>{a.packageName.replace(" · ", ", ")}{a.addOns ? ` + ${a.addOns}` : ""}</dd></div>
      <div><dt>Vehicle</dt><dd>{a.vehicle}</dd></div>
      <div><dt>Address</dt><dd>{a.address}</dd></div>
      <div><dt>Payment</dt><dd>{a.status === "cancelled"
        ? (a.refunded ? `$${a.deposit} deposit refunded` : `$${a.deposit} deposit kept (non-refundable)`)
        : `$${a.deposit} deposit paid · about $${Math.max(0, a.total - a.deposit)} due on the day`}</dd></div>
      {a.status === "cancelled" && <div><dt>Cancelled by</dt><dd>{a.cancelledBy === "camotive" ? "Camotive" : "You"}</dd></div>}
    </dl>
    {a.canCancel && (cancelling === a.code
      ? <div className="manage-confirm" role="group" aria-label={`Cancel the ${fmt(a.date)} appointment?`}>
        <p>Cancel this appointment? Your <strong>${a.deposit} deposit is non-refundable</strong>, and the time will be opened up for someone else.</p>
        <div className="hero-actions">
          <button className="button danger-button" type="button" disabled={busy} onClick={() => cancel(a.code)}>{busy ? "Cancelling…" : "Yes, cancel it"}</button>
          <button className="outline-button" type="button" disabled={busy} onClick={() => setCancelling(null)}>Keep appointment</button>
        </div>
      </div>
      : <div className="appointment-actions"><button className="outline-button" type="button" onClick={() => { setCancelling(a.code); setMessage(""); }}>Cancel appointment</button>
        <a className="text-link" href="tel:+12105730671">Need to change it? Call {PHONE}</a></div>)}
  </article>;

  return <section className="section my-appointments" aria-live="polite">
    {stage === "email" && <form className="signin-card" onSubmit={requestCode}>
      <h2>Sign in with your email</h2>
      <p>Enter the email you booked with. We&apos;ll send a 6-digit code to sign in, so there&apos;s no password to remember.</p>
      <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <BookingChallenge key={challenge} siteKey={status.siteKey!} action="recovery" onToken={setBotToken} />
      <button className="button" disabled={busy || !botToken}>{busy ? "Sending…" : "Email me a code"}</button>
    </form>}

    {stage === "code" && <form className="signin-card" onSubmit={verifyCode}>
      <h2>Enter your code</h2>
      <p>We sent a 6-digit code to <strong>{email}</strong> if it has bookings with us. It expires in 15 minutes.</p>
      <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, ""))} className="code-input" /></label>
      <button className="button" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "View my appointments"}</button>
      <button type="button" className="text-button" onClick={() => { setStage("email"); setMessage(""); }}>Use a different email or send a new code</button>
    </form>}

    {stage === "list" && appointments && <div className="appointment-list">
      <div className="appointment-list-head">
        <h2>Your appointments</h2>
        <div className="hero-actions"><a className="button" href="/book">Book another detail</a><button type="button" className="text-button" onClick={() => signOut()}>Sign out</button></div>
      </div>
      {message && <p className="manage-message" role="status">{message}</p>}
      <h3 className="appointment-group">Upcoming</h3>
      {upcoming.length ? upcoming.map(card) : <p className="empty-note">No upcoming appointments. <a className="text-link" href="/book">Book a detail</a></p>}
      {past.length > 0 && <><h3 className="appointment-group">Past and cancelled</h3>{past.map(card)}</>}
      <p className="policy-note">Cancelling keeps the ${depositDollars} deposit, as agreed when booking. If we ever have to cancel, we refund it in full.</p>
    </div>}

    {stage !== "list" && message && <p className="manage-message" role="status">{message}</p>}
  </section>;
}
