"use client";
// Online booking for detailing: choose a service, pick an open slot on the live
// availability calendar, add details, review, and send the request. The request
// holds the slot until Cam confirms it, and the customer is told exactly that.
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BookingChallenge from "./BookingChallenge";
import { prices, extras, bookingTimes, depositPercent } from "../lib/booking-catalog";

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
const steps = ["Service", "Date & time", "Your details", "Review"];

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
      if (!response.ok || !data.enabled) throw new Error();
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
  const [botToken, setBotToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ code: string; total: number } | null>(null);
  const submission = useRef({ signature: "", key: "" });
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/appointments/status", { cache: "no-store" }).then(r => r.json()).then(setStatus).catch(() => setStatus({ enabled: false }));
    const q = new URLSearchParams(window.location.search);
    const service = q.get("service"); if (service === "full" || service === "premium" || service === "maintenance") setPkg(service);
    const s = q.get("size"); if (s === "small" || s === "medium" || s === "large") setSize(s);
    const extra = q.get("addon"); if (extra && extra in extras) setAddOns([extra as AddOnId]);
    const d = q.get("date"); const t = q.get("time");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) { setDate(d); if (t === "8:00 AM" || t === "1:00 PM") setTime(t); }
  }, []);

  const total = useMemo(() => prices[pkg][size] + addOns.reduce((n, id) => n + extras[id][1], 0), [pkg, size, addOns]);
  // Move focus to the new step's heading so keyboard and screen-reader users aren't left on a removed button.
  const go = (n: number) => { setStep(n); setError(""); requestAnimationFrame(() => { top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); top.current?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true }); }); };
  const detailsComplete = Object.values(contact).every(v => v.trim().length > 1);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !botToken || !time) return;
    setBusy(true); setError("");
    const payload = { packageId: pkg, vehicleSize: size, addOnIds: addOns, date, time, ...contact };
    const signature = JSON.stringify(payload);
    if (submission.current.signature !== signature) submission.current = { signature, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": submission.current.key }, body: JSON.stringify({ ...payload, turnstileToken: botToken }) });
      const result = await response.json();
      if (response.status === 409 && /requested by someone else/.test(result.error ?? "")) { setTime(""); setError(result.error); go(2); return; }
      if (!response.ok || !result.confirmationCode) { setError(result.error || `We couldn't send your request. Please call or text ${PHONE}.`); return; }
      setDone({ code: result.confirmationCode, total: result.total });
      requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch { setError("Connection interrupted. Send again with the same details, or call Camotive."); }
    finally { setBusy(false); setBotToken(""); setChallenge(v => v + 1); }
  }

  if (!status) return <div className="booking-panel"><p>Checking availability…</p></div>;
  if (!status.enabled) return <div className="booking-panel"><p>Online booking is temporarily unavailable. Call or text Camotive to schedule.</p><a className="button" href="tel:+12105730671">Call {PHONE}</a></div>;

  if (done) return <div className="booking-shell" ref={top}><div className="booking-done" role="status">
    <p className="eyebrow">Request received</p>
    <h3 tabIndex={-1}>Your time is held. We&apos;ll confirm it shortly.</h3>
    <p>This isn&apos;t a confirmation yet. We&apos;ve emailed you a copy of your request, and you&apos;ll get a second email the moment it&apos;s confirmed.</p>
    <dl className="done-summary">
      <div><dt>Reference</dt><dd>{done.code}</dd></div>
      <div><dt>When</dt><dd>{fmt(date, { weekday: "long", month: "long", day: "numeric" })}, {time}</dd></div>
      <div><dt>Service</dt><dd>{prices[pkg].name}, {size}</dd></div>
      <div><dt>Estimate</dt><dd>${done.total}</dd></div>
    </dl>
    <ol className="after-steps">
      <li><strong>Now</strong> Your request is in and the slot is held.</li>
      <li><strong>Shortly</strong> We confirm, and you get a confirmation email with a calendar invite.</li>
      <li><strong>Day before</strong> A reminder email with everything you need.</li>
      <li><strong>On the day</strong> We arrive at {time}. A {depositPercent}% deposit is collected before work begins.</li>
    </ol>
  </div></div>;

  return <div className="booking-shell" ref={top}>
    <ol className="booking-progress" aria-label="Booking steps">
      {steps.map((label, i) => <li key={label} className={step > i + 1 ? "done" : step === i + 1 ? "current" : ""} aria-current={step === i + 1 ? "step" : undefined}>
        <span>{step > i + 1 ? "✓" : i + 1}</span><small>{label}</small></li>)}
    </ol>

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
      <h4>Add-ons <small>Optional</small></h4>
      <div className="addon-grid">{(Object.keys(extras) as AddOnId[]).map(id => <label key={id}><input type="checkbox" checked={addOns.includes(id)}
        onChange={() => setAddOns(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])} /><span>{extras[id][0]}</span><b>+${extras[id][1]}</b></label>)}</div>
      <div className="booking-footer"><div><small>Estimated total</small><strong>${total}</strong></div><button type="button" className="button" onClick={() => go(2)}>Choose a time</button></div>
    </div>}

    {step === 2 && <div className="booking-panel">
      <button type="button" className="back" onClick={() => go(1)}>Back</button>
      <h3 tabIndex={-1}>When should we come by?</h3>
      {error && <p className="form-error" role="alert">{error}</p>}
      <AvailabilityCalendar value={date} time={time} onPick={(d, t) => { setDate(d); setTime(t); setError(""); }} />
      <div className="booking-footer"><div><small>Your time</small><strong className="selection-text">{date && time ? `${fmt(date, { weekday: "short", month: "short", day: "numeric" })}, ${time}` : "Choose a day and time"}</strong></div>
        <button type="button" className="button" disabled={!date || !time} onClick={() => go(3)}>Add your details</button></div>
    </div>}

    {step === 3 && <form className="booking-panel" onSubmit={e => { e.preventDefault(); if (detailsComplete) go(4); }}>
      <button type="button" className="back" onClick={() => go(2)}>Back</button>
      <h3 tabIndex={-1}>Where is the car?</h3>
      <div className="form-grid">
        <label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={100} value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })} /></label>
        <label>Mobile number<input name="phone" type="tel" autoComplete="tel" required value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })} placeholder="(210) 555-0123" /></label>
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })} /></label>
        <label>Vehicle<input name="vehicle" required minLength={3} maxLength={120} value={contact.vehicle} onChange={e => setContact({ ...contact, vehicle: e.target.value })} placeholder="Year, make and model" /></label>
        <label className="wide">Service address<input name="address" autoComplete="street-address" required minLength={8} maxLength={250} value={contact.address} onChange={e => setContact({ ...contact, address: e.target.value })} placeholder="Street address, San Antonio, TX" /></label>
      </div>
      <div className="booking-footer"><div><small>{prices[pkg].name}, {fmt(date, { month: "short", day: "numeric" })} at {time}</small><strong>${total}</strong></div><button className="button" type="submit">Review request</button></div>
    </form>}

    {step === 4 && <form className="booking-panel" onSubmit={submit}>
      <button type="button" className="back" onClick={() => go(3)}>Back</button>
      <h3 tabIndex={-1}>Review your request</h3>
      <dl className="review-list">
        <div><dt>Service</dt><dd>{prices[pkg].name}, {size}{addOns.length ? ` + ${addOns.map(id => extras[id][0]).join(", ")}` : ""}</dd><button type="button" className="text-button" onClick={() => go(1)}>Change</button></div>
        <div><dt>When</dt><dd>{fmt(date, { weekday: "long", month: "long", day: "numeric" })}, {time}</dd><button type="button" className="text-button" onClick={() => go(2)}>Change</button></div>
        <div><dt>Where</dt><dd>{contact.address}<br />{contact.vehicle}</dd><button type="button" className="text-button" onClick={() => go(3)}>Change</button></div>
        <div><dt>Contact</dt><dd>{contact.name}<br />{contact.phone} · {contact.email}</dd><button type="button" className="text-button" onClick={() => go(3)}>Change</button></div>
      </dl>
      <ul className="review-notes">
        <li>Estimate <strong>${total}</strong>. We confirm the final price before starting.</li>
        <li>A <strong>{depositPercent}% deposit</strong> is collected on site before work begins.</li>
        <li>Please have water and a power outlet within reach, and access to the parking spot.</li>
        <li>This sends a request. Your slot is held until we confirm it by email.</li>
      </ul>
      <BookingChallenge key={challenge} siteKey={status.siteKey!} action="booking" onToken={setBotToken} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="booking-footer"><div><small>Estimated total</small><strong>${total}</strong></div><button className="button" type="submit" disabled={busy || !botToken}>{busy ? "Sending…" : "Request this time"}</button></div>
    </form>}
  </div>;
}
