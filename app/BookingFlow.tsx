"use client";
// Online booking for detailing: choose a service, add-ons, an open slot on the live
// availability calendar, and contact details, then pay the deposit on Stripe's
// Checkout page. Payment confirms the booking; customers come back here to see it.
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BookingChallenge from "./BookingChallenge";
import { prices, extras, bookingTimes, depositDollars, holdMinutes } from "../lib/booking-catalog";

type PackageId = "full" | "premium" | "maintenance";
type AddOnId = keyof typeof extras;
type Size = "small" | "medium" | "large";
type Slot = (typeof bookingTimes)[number];
type Day = { date: string; slots: { time: Slot; state: "open" | "taken" | "unavailable" }[] };
type Status = { enabled: boolean; siteKey?: string | null };

const PHONE = "(210) 573-0671";
const packages: Record<PackageId, { blurb: string; time: string }> = {
  full: { blurb: "A complete interior and exterior reset for a normally maintained vehicle.", time: "About 3–4 hours" },
  premium: { blurb: "Everything in Full, plus shampoo or extraction, leather care and a 3–6 month sealant.", time: "Longer visit; we confirm timing" },
  maintenance: { blurb: "For returning clients every 2–4 weeks, keeping a detailed car that way.", time: "Shorter visit" },
};
const sizes: Record<Size, string> = { small: "Coupe or sedan", medium: "Crossover, small SUV or truck", large: "Full-size truck or 3-row SUV" };
const steps = ["Service", "Add-ons", "Date & time", "Your details", "Deposit"];
const SAVED = "camotive-booking";
type Saved = { pkg: PackageId; size: Size; addOns: AddOnId[]; date: string; time: Slot | ""; contact: Record<"name" | "phone" | "email" | "vehicle" | "address", string> };
type Booked = { code: string; status: string; date: string; time: string; packageName: string; addOns: string; total: number; deposit: number };
// The booking is kept in this tab while the customer is on Stripe's page, so coming
// back (paid or not) doesn't lose it. Storage can be unavailable; that's fine.
const save = (value: Saved) => { try { sessionStorage.setItem(SAVED, JSON.stringify(value)); } catch {} };
const load = (): Saved | null => { try { return JSON.parse(sessionStorage.getItem(SAVED) ?? "null"); } catch { return null; } };
const forget = () => { try { sessionStorage.removeItem(SAVED); } catch {} };

const isoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
const shift = (iso: string, days: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso: string, n: number) => { const d = new Date(`${monthStart(iso)}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

function AvailabilityCalendar({ value, time, onPick }: { value: string; time: string; onPick: (date: string, time: Slot | "") => void }) {
  const tomorrow = shift(isoToday(), 1);
  const [month, setMonth] = useState(() => monthStart(value || tomorrow));
  const [days, setDays] = useState<Record<string, Day>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const firstWeekday = new Date(`${month}T12:00:00Z`).getUTCDay();
  const gridStart = shift(month, -firstWeekday);

  const load = useCallback(async (start: string) => {
    setLoading(true); setError(false);
    try {
      const response = await fetch(`/api/availability?from=${start}&days=42`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.days?.length) throw new Error();
      setDays(Object.fromEntries((data.days as Day[]).map(d => [d.date, d])));
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(gridStart); }, [gridStart, load]);

  const cells = Array.from({ length: 42 }, (_, i) => shift(gridStart, i));
  const selected = value ? days[value] : undefined;
  const canGoBack = month > monthStart(tomorrow);
  return <div className="availability">
    <div className="availability-calendar" aria-busy={loading}>
      <div className="calendar-header">
        <button type="button" disabled={!canGoBack} aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <strong aria-live="polite">{fmt(month, { month: "long", year: "numeric" })}</strong>
        <button type="button" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>›</button>
      </div>
      <div className="calendar-days" role="group" aria-label="Available days">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <span key={d} aria-hidden="true">{d.slice(0, 2)}</span>)}
        {cells.map(iso => {
          const day = days[iso];
          const inMonth = iso.slice(0, 7) === month.slice(0, 7);
          const open = day?.slots.filter(s => s.state === "open").length ?? 0;
          const bookable = day?.slots.some(s => s.state !== "unavailable") ?? false;
          const state = !bookable ? "past" : open === 0 ? "full" : open < bookingTimes.length ? "some" : "open";
          const label = `${fmt(iso, { weekday: "long", month: "long", day: "numeric" })}: ${state === "past" ? "not available" : state === "full" ? "fully booked" : `${open} of ${bookingTimes.length} times open`}`;
          return <button type="button" key={iso} data-state={state} aria-label={label} aria-pressed={value === iso}
            className={`${inMonth ? "" : "outside"} ${value === iso ? "selected" : ""}`} disabled={state === "past" || state === "full" || loading}
            onClick={() => onPick(iso, "")}>
            <span>{Number(iso.slice(8))}</span>{bookable && <i aria-hidden="true">{day!.slots.map(s => <b key={s.time} data-open={s.state === "open"} />)}</i>}
          </button>;
        })}
      </div>
      <div className="calendar-legend" aria-hidden="true"><span><b data-open="true" /> Open</span><span><b data-open="false" /> Taken</span></div>
      {error && <p className="form-error" role="alert">Availability couldn&apos;t load. <button type="button" className="text-button" onClick={() => load(gridStart)}>Try again</button> or call {PHONE}.</p>}
    </div>
    <div className="slot-picker">
      <p className="field-label">{value ? fmt(value, { weekday: "long", month: "long", day: "numeric" }) : "Choose a day"}</p>
      {selected ? <div className="slot-list">{selected.slots.map(s => <button type="button" key={s.time} disabled={s.state !== "open"} aria-pressed={time === s.time}
        className={time === s.time ? "selected" : ""} onClick={() => onPick(selected.date, s.time)}>
        <strong>{s.time}</strong><small>{s.state === "open" ? (s.time === "8:00 AM" ? "Morning arrival" : "Afternoon arrival") : "Taken"}</small></button>)}</div>
        : <p className="slot-hint">Days with an open dot have at least one time available. We arrive at the start of your slot.</p>}
    </div>
  </div>;
}

export default function BookingFlow() {
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState(1);
  const [pkg, setPkg] = useState<PackageId>("full");
  const [size, setSize] = useState<Size>("small");
  const [addOns, setAddOns] = useState<AddOnId[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState<Slot | "">("");
  const [contact, setContact] = useState({ name: "", phone: "", email: "", vehicle: "", address: "" });
  const [agreed, setAgreed] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<Booked | null>(null);
  const submission = useRef({ signature: "", key: "" });
  const top = useRef<HTMLDivElement>(null);

  const restore = useCallback(() => {
    const saved = load();
    if (!saved) return false;
    setPkg(saved.pkg); setSize(saved.size); setAddOns(saved.addOns); setDate(saved.date); setTime(saved.time); setContact(saved.contact);
    return true;
  }, []);

  // Back from Stripe after paying: wait for the booking to be confirmed (the
  // server checks with Stripe if the webhook hasn't arrived yet).
  const confirmPayment = useCallback(async (sessionId: string) => {
    setConfirming(true);
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const response = await fetch(`/api/checkout?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        const result = await response.json();
        if (response.ok && result.status === "confirmed") { forget(); setDone(result); setConfirming(false); return; }
        if (response.ok && result.status === "refunded") {
          setConfirming(false); setError(`Sorry, that time was taken while you were paying, so it isn't booked. Your $${depositDollars} deposit has been refunded in full. Please choose another time.`);
          restore(); setTime(""); setStep(3); return;
        }
        if (!response.ok && response.status !== 503) break;
      } catch {}
      await new Promise(r => setTimeout(r, 1500));
    }
    setConfirming(false);
    setError(`We're still waiting to hear from our payment provider. If you were charged, your confirmation email will arrive shortly. Questions? Call or text ${PHONE}.`);
  }, [restore]);

  useEffect(() => {
    fetch("/api/appointments/status", { cache: "no-store" }).then(r => r.json()).then(setStatus).catch(() => setStatus({ enabled: false }));
    const q = new URLSearchParams(window.location.search);
    const paid = q.get("paid"), unpaid = q.get("unpaid"), release = q.get("release");
    if (paid || unpaid) window.history.replaceState(null, "", window.location.pathname);
    if (paid) { queueMicrotask(() => confirmPayment(paid)); return; }
    if (unpaid) {
      // Came back from Stripe without paying: release the held time and pick up where they left off.
      queueMicrotask(() => {
        const hasSaved = restore();
        if (/^CAM-[A-F0-9]{12}$/.test(unpaid) && release) fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: unpaid, release }) }).catch(() => {});
        setNotice("Payment wasn't completed, so nothing was booked or charged. You can try again below.");
        setStep(hasSaved ? 5 : 1);
      });
      return;
    }
    const service = q.get("service"); if (service === "full" || service === "premium" || service === "maintenance") setPkg(service);
    const s = q.get("size"); if (s === "small" || s === "medium" || s === "large") setSize(s);
    const extra = q.get("addon"); if (extra && extra in extras) setAddOns([extra as AddOnId]);
    const d = q.get("date"); const t = q.get("time");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) { setDate(d); if (t === "8:00 AM" || t === "1:00 PM") setTime(t); }
  }, [confirmPayment, restore]);

  const total = useMemo(() => prices[pkg][size] + addOns.reduce((n, id) => n + extras[id][1], 0), [pkg, size, addOns]);
  // Move focus to the new step's heading so keyboard and screen-reader users aren't left on a removed button.
  const go = (n: number) => { setStep(n); setError(""); requestAnimationFrame(() => { top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); top.current?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true }); }); };
  const detailsComplete = Object.values(contact).every(v => v.trim().length > 1);
  const serviceLine = `${prices[pkg].name}, ${size}`;
  const addOnLine = addOns.length ? addOns.map(id => extras[id][0]).join(", ") : "None";

  async function pay(event: FormEvent) {
    event.preventDefault();
    if (busy || !botToken || !time || !agreed) return;
    setBusy(true); setError(""); setNotice("");
    const payload = { packageId: pkg, vehicleSize: size, addOnIds: addOns, date, time, ...contact };
    const signature = JSON.stringify(payload);
    if (submission.current.signature !== signature) submission.current = { signature, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": submission.current.key }, body: JSON.stringify({ ...payload, turnstileToken: botToken }) });
      const result = await response.json();
      if (response.status === 409) {
        submission.current = { signature: "", key: "" };
        if (/taken|released/.test(result.error ?? "")) { setTime(""); go(3); setError(result.error); return; }
      }
      if (!response.ok || !result.confirmationCode) { setError(result.error || `We couldn't start the payment. Please call or text ${PHONE}.`); return; }
      if (result.status === "confirmed") { forget(); setDone({ code: result.confirmationCode, status: "confirmed", date, time, packageName: result.packageName, addOns: result.addOns, total: result.total, deposit: result.deposit }); return; }
      save({ pkg, size, addOns, date, time, contact });
      window.location.assign(result.checkoutUrl);
      return; // keep the button busy while the browser leaves for Stripe
    } catch { setError("Connection interrupted. Try again with the same details, or call Camotive."); }
    setBusy(false); setBotToken(""); setChallenge(v => v + 1);
  }

  if (confirming) return <div className="booking-shell" ref={top}><div className="booking-done" role="status" aria-live="polite">
    <p className="eyebrow">Payment received</p><h3 tabIndex={-1}>Confirming your booking…</h3><p>This takes a few seconds. Please keep this page open.</p></div></div>;

  if (!status) return <div className="booking-panel"><p>Checking availability…</p></div>;
  // Until online payment is set up, every step works the same, but the last one
  // sends the chosen booking to Camotive by text instead of taking the deposit.
  const textMode = !status.enabled;
  const smsBody = [`Hi Camotive, I'd like to book:`, `${serviceLine}${addOns.length ? ` + ${addOnLine}` : ""}`,
    date && time ? `${fmt(date, { weekday: "long", month: "long", day: "numeric" })} at ${time}` : "",
    `Vehicle: ${contact.vehicle}`, `Address: ${contact.address}`, `${contact.name}, ${contact.phone}, ${contact.email}`, `Estimate: $${total}`].filter(Boolean).join("\n");

  if (done) return <div className="booking-shell" ref={top}><div className="booking-done" role="status">
    <p className="eyebrow"><span className="status-dot" aria-hidden="true" />Confirmed</p>
    <h3 tabIndex={-1}>You&apos;re booked.</h3>
    <p>Your ${done.deposit} deposit is paid and your time is reserved. We&apos;ve emailed your confirmation with a calendar invite. See you {fmt(done.date, { weekday: "long" })}.</p>
    <dl className="done-summary">
      <div><dt>Reference</dt><dd>{done.code}</dd></div>
      <div><dt>When</dt><dd>{fmt(done.date, { weekday: "long", month: "long", day: "numeric" })}, {done.time}</dd></div>
      <div><dt>Service</dt><dd>{done.packageName.replace(" · ", ", ")}{done.addOns ? ` + ${done.addOns}` : ""}</dd></div>
      <div><dt>Balance</dt><dd>${Math.max(0, done.total - done.deposit)} due on the day</dd></div>
    </dl>
    <ol className="after-steps">
      <li><strong>Now</strong> Check your inbox for the confirmation and calendar invite.</li>
      <li><strong>Day before</strong> A reminder email with everything you need.</li>
      <li><strong>On the day</strong> We arrive at {done.time}. The rest of the total is paid when the detail is done.</li>
    </ol>
    <p className="done-manage">To see your bookings or cancel, go to <a className="text-link" href="/appointment">My appointments</a>. The deposit is non-refundable if you cancel.</p>
  </div></div>;

  return <div className="booking-shell" ref={top}>
    <ol className="booking-progress" aria-label="Booking steps">
      {(textMode ? [...steps.slice(0, 4), "Send"] : steps).map((label, i) => <li key={label} className={step > i + 1 ? "done" : step === i + 1 ? "current" : ""} aria-current={step === i + 1 ? "step" : undefined}>
        <span>{step > i + 1 ? "✓" : i + 1}</span><small>{label}</small></li>)}
    </ol>
    {notice && <p className="booking-notice" role="status">{notice}</p>}

    {step === 1 && <div className="booking-panel">
      <h3 tabIndex={-1}>Choose your detail</h3>
      <div className="package-choice" role="radiogroup" aria-label="Detail package">
        {(Object.keys(packages) as PackageId[]).map(id => <button type="button" role="radio" aria-checked={pkg === id} key={id} className={pkg === id ? "selected" : ""} onClick={() => setPkg(id)}>
          <span className="package-name">{prices[id].name}</span><span className="package-price">from ${prices[id].small}</span>
          <small>{packages[id].blurb}</small><small className="package-time">{packages[id].time}</small></button>)}
      </div>
      <p className="quote-aside">Ceramic coating or paint correction? Those are quoted first. <a className="text-link" href="/quote">Request a quote</a></p>
      <h4>Vehicle size</h4>
      <div className="size-choice-grid" role="radiogroup" aria-label="Vehicle size">
        {(Object.keys(sizes) as Size[]).map(s => <button type="button" role="radio" aria-checked={size === s} key={s} className={size === s ? "selected" : ""} onClick={() => setSize(s)}>
          <b>{s}</b><small>{sizes[s]}</small><span>${prices[pkg][s]}</span></button>)}
      </div>
      <div className="booking-footer"><div><small>{serviceLine}</small><strong>${prices[pkg][size]}</strong></div><button type="button" className="button" onClick={() => go(2)}>Next: add-ons</button></div>
    </div>}

    {step === 2 && <div className="booking-panel">
      <button type="button" className="back" onClick={() => go(1)}>Back</button>
      <h3 tabIndex={-1}>Add anything extra?</h3>
      <p className="step-intro">Optional. Add-ons are done during the same visit.</p>
      <div className="addon-grid">{(Object.keys(extras) as AddOnId[]).map(id => <label key={id} className={addOns.includes(id) ? "selected" : ""}><input type="checkbox" checked={addOns.includes(id)}
        onChange={() => setAddOns(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])} /><span>{extras[id][0]}</span><b>+${extras[id][1]}</b></label>)}</div>
      <div className="booking-footer"><div><small>Estimated total</small><strong>${total}</strong></div><button type="button" className="button" onClick={() => go(3)}>{addOns.length ? "Next: choose a time" : "Skip: choose a time"}</button></div>
    </div>}

    {step === 3 && <div className="booking-panel">
      <button type="button" className="back" onClick={() => go(2)}>Back</button>
      <h3 tabIndex={-1}>When should we come by?</h3>
      {error && <p className="form-error" role="alert">{error}</p>}
      <AvailabilityCalendar value={date} time={time} onPick={(d, t) => { setDate(d); setTime(t); setError(""); }} />
      <div className="booking-footer"><div><small>Your time</small><strong className="selection-text">{date && time ? `${fmt(date, { weekday: "short", month: "short", day: "numeric" })}, ${time}` : "Choose a day and time"}</strong></div>
        <button type="button" className="button" disabled={!date || !time} onClick={() => go(4)}>Next: your details</button></div>
    </div>}

    {step === 4 && <form className="booking-panel" onSubmit={e => { e.preventDefault(); if (detailsComplete) go(5); }}>
      <button type="button" className="back" onClick={() => go(3)}>Back</button>
      <h3 tabIndex={-1}>Where is the car?</h3>
      <div className="form-grid">
        <label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={100} value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} /></label>
        <label>Mobile number<input name="phone" type="tel" autoComplete="tel" required value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} placeholder="(210) 555-0123" /></label>
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} /></label>
        <label>Vehicle<input name="vehicle" required minLength={3} maxLength={120} value={contact.vehicle} onChange={e => setContact({ ...contact, vehicle: e.target.value })} placeholder="Year, make and model" /></label>
        <label className="wide">Service address<input name="address" autoComplete="street-address" required minLength={8} maxLength={250} value={contact.address} onChange={e => setContact({ ...contact, address: e.target.value })} placeholder="Street address, San Antonio, TX" /></label>
      </div>
      <div className="booking-footer"><div><small>{prices[pkg].name}, {date && fmt(date, { month: "short", day: "numeric" })} at {time}</small><strong>${total}</strong></div><button className="button" type="submit">{textMode ? "Next: review" : "Next: review and pay"}</button></div>
    </form>}

    {step === 5 && textMode && <div className="booking-panel">
      <button type="button" className="back" onClick={() => go(4)}>Back</button>
      <h3 tabIndex={-1}>Review and send your booking</h3>
      <dl className="review-list">
        <div><dt>Service</dt><dd>{serviceLine}</dd><button type="button" className="text-button" onClick={() => go(1)}>Change</button></div>
        <div><dt>Add-ons</dt><dd>{addOnLine}</dd><button type="button" className="text-button" onClick={() => go(2)}>Change</button></div>
        <div><dt>When</dt><dd>{date && fmt(date, { weekday: "long", month: "long", day: "numeric" })}, {time}</dd><button type="button" className="text-button" onClick={() => go(3)}>Change</button></div>
        <div><dt>Where</dt><dd>{contact.address}<br />{contact.vehicle}</dd><button type="button" className="text-button" onClick={() => go(4)}>Change</button></div>
        <div><dt>Contact</dt><dd>{contact.name}<br />{contact.phone} · {contact.email}</dd><button type="button" className="text-button" onClick={() => go(4)}>Change</button></div>
      </dl>
      <p className="text-mode-note" role="note">Online payment isn&apos;t available yet. Send this booking to us by text and we&apos;ll confirm your time and how to pay the ${depositDollars} deposit that holds it.</p>
      <div className="booking-footer"><div><small>Estimated total</small><strong>${total}</strong></div>
        <div className="hero-actions"><a className="outline-button" href="tel:+12105730671">Call {PHONE}</a><a className="button" href={`sms:+12105730671?&body=${encodeURIComponent(smsBody)}`}>Text us this booking</a></div></div>
    </div>}

    {step === 5 && !textMode && <form className="booking-panel" onSubmit={pay}>
      <button type="button" className="back" onClick={() => go(4)}>Back</button>
      <h3 tabIndex={-1}>Review and pay the deposit</h3>
      <dl className="review-list">
        <div><dt>Service</dt><dd>{serviceLine}</dd><button type="button" className="text-button" onClick={() => go(1)}>Change</button></div>
        <div><dt>Add-ons</dt><dd>{addOnLine}</dd><button type="button" className="text-button" onClick={() => go(2)}>Change</button></div>
        <div><dt>When</dt><dd>{date && fmt(date, { weekday: "long", month: "long", day: "numeric" })}, {time}</dd><button type="button" className="text-button" onClick={() => go(3)}>Change</button></div>
        <div><dt>Where</dt><dd>{contact.address}<br />{contact.vehicle}</dd><button type="button" className="text-button" onClick={() => go(4)}>Change</button></div>
        <div><dt>Contact</dt><dd>{contact.name}<br />{contact.phone} · {contact.email}</dd><button type="button" className="text-button" onClick={() => go(4)}>Change</button></div>
      </dl>
      <dl className="deposit-summary">
        <div><dt>Estimated total</dt><dd>${total}</dd></div>
        <div><dt>Deposit due now</dt><dd>${depositDollars}</dd></div>
        <div><dt>Due on the day</dt><dd>${Math.max(0, total - depositDollars)}</dd></div>
      </dl>
      <ul className="review-notes">
        <li>The deposit confirms your time and goes toward your total. We confirm the final price before starting.</li>
        <li>You&apos;ll pay on Stripe&apos;s secure checkout. We hold this time for {holdMinutes} minutes while you pay.</li>
        <li>Please have water and a power outlet within reach, and access to the parking spot.</li>
      </ul>
      <label className="agree"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} required />
        <span>I understand the ${depositDollars} deposit is <strong>non-refundable if I cancel</strong>. If Camotive has to cancel, it&apos;s refunded in full.</span></label>
      <BookingChallenge key={challenge} siteKey={status.siteKey!} action="booking" onToken={setBotToken} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="booking-footer"><div><small>Deposit due now</small><strong>${depositDollars}</strong></div><button className="button" type="submit" disabled={busy || !botToken || !agreed}>{busy ? "Opening secure checkout…" : `Pay $${depositDollars} deposit`}</button></div>
    </form>}
  </div>;
}
