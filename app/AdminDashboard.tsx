"use client";
// Cam's dashboard (/admin). Sign in with a 6-digit code emailed to the owner's
// address, then: upcoming jobs by day (call, text, directions, move, cancel with
// refund), the last 30 days, blocking off time, and quote requests.
// The session token is kept on this device for 7 days so Cam stays signed in on
// his phone; signing out removes it.
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import BookingChallenge from "./BookingChallenge";
import { bookingTimes, slotLabel } from "../lib/booking-catalog";

type Job = {
  code: string; date: string; time: string; status: string; name: string; phone: string; email: string; vehicle: string; address: string;
  packageName: string; addOns: string; total: number; deposit: number; paid: boolean; refunded: boolean; cancelledBy: string | null; moved: boolean;
};
type Quote = { reference: string; status: "new" | "replied"; receivedAt: number; service: string; vehicle: string; name: string; email: string; phone: string; timing: string; notes: string };
type Data = { today: string; upcoming: Job[]; recent: Job[]; blocks: { date: string; time: string }[]; quotes: Quote[] };
type Status = { enabled: boolean; dashboard?: boolean; siteKey?: string | null };
type Slot = (typeof bookingTimes)[number];

const KEY = "camotive-admin";
const remember = (value: string | null) => { try { if (value) localStorage.setItem(KEY, value); else localStorage.removeItem(KEY); } catch {} };
const remembered = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const shift = (iso: string, days: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }) =>
  new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const phone = (p: string) => p.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
const maps = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
const service = (j: { packageName: string; addOns: string }) => `${j.packageName.replace(" · ", ", ")}${j.addOns ? ` + ${j.addOns}` : ""}`;

export default function AdminDashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [stage, setStage] = useState<"email" | "code" | "dash">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [botToken, setBotToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<"jobs" | "time" | "quotes">("jobs");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState<{ code: string; kind: "move" | "cancel" } | null>(null);
  const [moveTo, setMoveTo] = useState<{ date: string; time: Slot | "" }>({ date: "", time: "" });
  const [moveSlots, setMoveSlots] = useState<Record<string, string>>({});
  const [block, setBlock] = useState<{ date: string; times: string[] }>({ date: "", times: ["all"] });
  const [quoteFilter, setQuoteFilter] = useState<"new" | "all">("new");

  const signOut = useCallback((note = "") => { remember(null); setSession(null); setData(null); setStage("email"); setMessage(note); }, []);

  const call = useCallback(async (token: string, method: "GET" | "POST", body?: unknown) => {
    const response = await fetch("/api/admin/dashboard", { method, cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) { signOut(result.error); return null; }
    if (!response.ok) throw new Error(result.error || "Something went wrong. Try again.");
    return result;
  }, [signOut]);

  const load = useCallback(async (token: string) => {
    const result = await call(token, "GET").catch(error => { setMessage(error.message); return null; });
    if (result) { setData(result); setStage("dash"); }
  }, [call]);

  useEffect(() => {
    fetch("/api/appointments/status", { cache: "no-store" }).then(r => r.json()).then(setStatus).catch(() => setStatus({ enabled: false }));
    const saved = remembered();
    if (saved) queueMicrotask(() => { setSession(saved); load(saved); });
  }, [load]);

  // When moving a job, show which windows are free on the chosen day.
  useEffect(() => {
    if (!moveTo.date) return;
    let live = true;
    fetch(`/api/availability?from=${moveTo.date}&days=1`, { cache: "no-store" }).then(r => r.json())
      .then(result => { if (live) setMoveSlots(Object.fromEntries((result.days?.[0]?.slots ?? []).map((s: { time: string; state: string }) => [s.time, s.state]))); })
      .catch(() => setMoveSlots({}));
    return () => { live = false; };
  }, [moveTo.date]);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    if (busy || !botToken) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, turnstileToken: botToken }) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "Couldn't send a code."); return; }
      setStage("code"); setCode(""); setMessage(result.message);
    } catch { setMessage("Connection interrupted. Try again."); }
    finally { setBusy(false); setBotToken(""); setChallenge(v => v + 1); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "That code isn't right."); return; }
      remember(result.session); setSession(result.session); await load(result.session);
    } catch { setMessage("Connection interrupted. Try again."); }
    finally { setBusy(false); }
  }

  async function act(body: Record<string, unknown>, success: string) {
    if (!session || busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await call(session, "POST", body);
      if (!result) return;
      setOpen(null);
      setMessage(result.existingBookings ? `${success} Note: ${result.existingBookings} booking${result.existingBookings > 1 ? "s are" : " is"} already on that day; blocking doesn't cancel ${result.existingBookings > 1 ? "them" : "it"}.` : success);
      await load(session);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  const days = useMemo(() => {
    const groups = new Map<string, Job[]>();
    for (const job of data?.upcoming ?? []) groups.set(job.date, [...(groups.get(job.date) ?? []), job]);
    return [...groups.entries()];
  }, [data]);
  const blockDays = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const b of data?.blocks ?? []) groups.set(b.date, [...(groups.get(b.date) ?? []), b.time]);
    return [...groups.entries()];
  }, [data]);

  if (!status) return <section className="section admin"><p>Loading…</p></section>;
  if (!status.dashboard) return <section className="section admin"><div className="signin-card"><h1>Dashboard</h1>
    <p>The dashboard turns on once the booking database and email are connected (steps 1–5 in VERCEL.md).</p></div></section>;

  if (stage !== "dash") return <section className="section admin">
    {stage === "email" ? <form className="signin-card" onSubmit={requestCode}>
      <p className="eyebrow">Camotive</p><h1>Dashboard sign-in</h1>
      <p>Enter the owner&apos;s email. We&apos;ll send a 6-digit code to sign in.</p>
      <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <BookingChallenge key={challenge} siteKey={status.siteKey!} action="recovery" onToken={setBotToken} />
      <button className="button" disabled={busy || !botToken}>{busy ? "Sending…" : "Email me a code"}</button>
    </form> : <form className="signin-card" onSubmit={verify}>
      <p className="eyebrow">Camotive</p><h1>Enter your code</h1>
      <p>Sent to <strong>{email}</strong> if it&apos;s the owner&apos;s address. It expires in 15 minutes.</p>
      <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, ""))} className="code-input" /></label>
      <button className="button" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</button>
      <button type="button" className="text-button" onClick={() => { setStage("email"); setMessage(""); }}>Send a new code</button>
    </form>}
    {message && <p className="manage-message" role="status">{message}</p>}
  </section>;

  const today = data!.today;
  const thisWeek = data!.upcoming.filter(j => j.date <= shift(today, 6)).length;
  const openQuotes = data!.quotes.filter(q => q.status === "new").length;
  const dayLabel = (date: string) => date === today ? `Today · ${fmt(date)}` : date === shift(today, 1) ? `Tomorrow · ${fmt(date)}` : fmt(date);

  const jobCard = (j: Job, past = false) => <article key={j.code} className={`admin-job ${j.status}`} aria-labelledby={`${j.code}-h`}>
    <div className="admin-job-head">
      <h4 id={`${j.code}-h`}>{past ? `${fmt(j.date, { weekday: "short", month: "short", day: "numeric" })}, ` : ""}{slotLabel[j.time] ?? j.time}</h4>
      <div className="admin-badges">{j.moved && <span className="badge">Moved</span>}
        {j.status === "cancelled" && <span className="badge badge-cancelled">{j.cancelledBy === "customer" ? "Cancelled by customer" : "Cancelled by you"}{j.refunded ? " · refunded" : ""}</span>}</div>
    </div>
    <p className="admin-job-service">{service(j)}</p>
    <p className="admin-job-customer"><strong>{j.name}</strong> · {j.vehicle}</p>
    {!past && <div className="admin-contact">
      <a className="chip" href={`tel:${j.phone}`}>Call</a><a className="chip" href={`sms:${j.phone}`}>Text</a>
      <a className="chip" href={maps(j.address)} target="_blank" rel="noopener noreferrer">Directions</a><a className="chip" href={`mailto:${j.email}`}>Email</a>
    </div>}
    <dl className="admin-job-facts">
      <div><dt>Address</dt><dd>{j.address}</dd></div>
      <div><dt>Phone</dt><dd>{phone(j.phone)}</dd></div>
      <div><dt>Payment</dt><dd>${j.total} estimate · {j.paid ? `$${j.deposit} deposit paid · $${Math.max(0, j.total - j.deposit)} to collect` : "no deposit recorded"}</dd></div>
      <div><dt>Reference</dt><dd>{j.code}</dd></div>
    </dl>
    {!past && (open?.code !== j.code ? <div className="hero-actions admin-actions">
      <button className="outline-button" type="button" onClick={() => { setOpen({ code: j.code, kind: "move" }); setMoveTo({ date: j.date, time: "" }); setMessage(""); }}>Move</button>
      <button className="outline-button" type="button" onClick={() => { setOpen({ code: j.code, kind: "cancel" }); setMessage(""); }}>Cancel &amp; refund</button>
    </div> : open.kind === "cancel" ? <div className="manage-confirm" role="group" aria-label="Cancel this booking?">
      <p>Cancel {j.name.split(" ")[0]}&apos;s booking? {j.paid ? `The $${j.deposit} deposit is refunded automatically, ` : ""}they get an email, and the window opens up again.</p>
      <div className="hero-actions">
        <button className="button danger-button" type="button" disabled={busy} onClick={() => act({ action: "cancel", code: j.code }, "Cancelled and the customer has been emailed.")}>{busy ? "Cancelling…" : "Yes, cancel it"}</button>
        <button className="outline-button" type="button" disabled={busy} onClick={() => setOpen(null)}>Keep it</button>
      </div>
    </div> : <form className="admin-move" onSubmit={e => { e.preventDefault(); if (moveTo.date && moveTo.time) act({ action: "reschedule", code: j.code, date: moveTo.date, time: moveTo.time }, "Moved. The customer has been emailed the new time with an updated invite."); }}>
      <label>New date<input type="date" required min={today} value={moveTo.date} onChange={e => setMoveTo({ date: e.target.value, time: "" })} /></label>
      <fieldset><legend>Window</legend><div className="admin-windows">
        {bookingTimes.map(t => {
          const state = moveSlots[t];
          const current = moveTo.date === j.date && t === j.time;
          return <label key={t} className={moveTo.time === t ? "selected" : ""}><input type="radio" name={`move-${j.code}`} value={t} disabled={current || Boolean(state && state !== "open")}
            checked={moveTo.time === t} onChange={() => setMoveTo({ ...moveTo, time: t })} />{slotLabel[t]}<small>{current ? "Current" : state === "taken" ? "Taken" : state === "unavailable" ? "Closed" : "Open"}</small></label>;
        })}
      </div></fieldset>
      <div className="hero-actions"><button className="button" disabled={busy || !moveTo.date || !moveTo.time}>{busy ? "Moving…" : "Move and email customer"}</button>
        <button className="outline-button" type="button" onClick={() => setOpen(null)}>Never mind</button></div>
    </form>)}
  </article>;

  return <section className="section admin">
    <div className="admin-head">
      <div><p className="eyebrow">Camotive</p><h1>Dashboard</h1></div>
      <div className="hero-actions"><button type="button" className="outline-button" disabled={busy} onClick={() => session && load(session)}>Refresh</button>
        <button type="button" className="text-button" onClick={() => signOut()}>Sign out</button></div>
    </div>
    {!status.enabled && <p className="admin-note">Online payment isn&apos;t live yet, so customers send bookings by text for now. Blocking time already works: blocked windows show as taken on the booking page.</p>}
    <dl className="admin-stats">
      <div><dt>Today</dt><dd>{data!.upcoming.filter(j => j.date === today).length}</dd></div>
      <div><dt>Next 7 days</dt><dd>{thisWeek}</dd></div>
      <div><dt>Open quotes</dt><dd>{openQuotes}</dd></div>
    </dl>
    <div className="admin-tabs" role="tablist" aria-label="Dashboard sections">
      {([["jobs", "Jobs"], ["time", "Block time"], ["quotes", `Quotes${openQuotes ? ` (${openQuotes})` : ""}`]] as const).map(([id, label]) =>
        <button key={id} role="tab" type="button" aria-selected={tab === id} className={tab === id ? "selected" : ""} onClick={() => { setTab(id); setMessage(""); setOpen(null); }}>{label}</button>)}
    </div>
    {message && <p className="manage-message" role="status">{message}</p>}

    {tab === "jobs" && <div className="admin-panel" role="tabpanel" aria-label="Jobs">
      {days.length === 0 && <p className="empty-note">No upcoming jobs yet.</p>}
      {days.map(([date, jobs]) => <section key={date} className="admin-day" aria-label={dayLabel(date)}><h3>{dayLabel(date)}</h3>{jobs.map(j => jobCard(j))}</section>)}
      {data!.recent.length > 0 && <details className="admin-recent"><summary>Last 30 days and cancelled ({data!.recent.length})</summary>{data!.recent.map(j => jobCard(j, true))}</details>}
    </div>}

    {tab === "time" && <div className="admin-panel" role="tabpanel" aria-label="Block time">
      <form className="admin-block" onSubmit={e => { e.preventDefault(); if (block.date && block.times.length) act({ action: "block", date: block.date, times: block.times }, `Blocked ${fmt(block.date)}.`); }}>
        <h3>Block off time</h3>
        <p>Blocked windows show as taken on the booking page. Existing bookings aren&apos;t affected.</p>
        <label>Date<input type="date" required min={today} value={block.date} onChange={e => setBlock({ ...block, date: e.target.value })} /></label>
        <fieldset><legend>What to block</legend><div className="admin-windows">
          {(["all", ...bookingTimes] as string[]).map(t => <label key={t} className={block.times.includes(t) ? "selected" : ""}>
            <input type="checkbox" checked={block.times.includes(t)} onChange={() => setBlock({ ...block, times: t === "all" ? ["all"] : block.times.includes(t) ? block.times.filter(x => x !== t) : [...block.times.filter(x => x !== "all"), t] })} />
            {t === "all" ? "Whole day" : slotLabel[t]}</label>)}
        </div></fieldset>
        <button className="button" disabled={busy || !block.date || !block.times.length}>{busy ? "Saving…" : "Block"}</button>
      </form>
      <h3 className="admin-subhead">Blocked</h3>
      {blockDays.length === 0 ? <p className="empty-note">Nothing blocked.</p> : <ul className="admin-blocks">{blockDays.map(([date, times]) =>
        <li key={date}><strong>{fmt(date)}</strong><div>{times.map(t => <span key={t} className="chip chip-static">{t === "all" ? "Whole day" : slotLabel[t] ?? t}
          <button type="button" aria-label={`Unblock ${t === "all" ? "whole day" : slotLabel[t]} on ${fmt(date)}`} disabled={busy} onClick={() => act({ action: "unblock", date, time: t }, "Unblocked.")}>×</button></span>)}</div></li>)}</ul>}
    </div>}

    {tab === "quotes" && <div className="admin-panel" role="tabpanel" aria-label="Quotes">
      <div className="admin-filter">{(["new", "all"] as const).map(f => <button key={f} type="button" aria-pressed={quoteFilter === f} onClick={() => setQuoteFilter(f)}>{f === "new" ? "Needs a reply" : "All"}</button>)}</div>
      {data!.quotes.filter(q => quoteFilter === "all" || q.status === "new").length === 0 && <p className="empty-note">{quoteFilter === "new" ? "All caught up." : "No quote requests yet."}</p>}
      {data!.quotes.filter(q => quoteFilter === "all" || q.status === "new").map(q => <article key={q.reference} className={`admin-job ${q.status}`}>
        <div className="admin-job-head"><h4>{q.service}</h4><div className="admin-badges"><span className={`badge ${q.status === "replied" ? "" : "badge-new"}`}>{q.status === "replied" ? "Replied" : "New"}</span></div></div>
        <p className="admin-job-customer"><strong>{q.name}</strong> · {q.vehicle}</p>
        <div className="admin-contact"><a className="chip" href={`tel:${q.phone}`}>Call</a><a className="chip" href={`sms:${q.phone}`}>Text</a><a className="chip" href={`mailto:${q.email}?subject=${encodeURIComponent(`Your ${q.service.toLowerCase()} quote`)}`}>Email</a></div>
        <dl className="admin-job-facts">
          <div><dt>Timing</dt><dd>{q.timing || "Not given"}</dd></div>
          {q.notes && <div><dt>Notes</dt><dd>{q.notes}</dd></div>}
          <div><dt>Received</dt><dd>{new Date(q.receivedAt * 1000).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</dd></div>
          <div><dt>Reference</dt><dd>{q.reference}</dd></div>
        </dl>
        <div className="hero-actions admin-actions"><button className="outline-button" type="button" disabled={busy} onClick={() => act({ action: "quote", reference: q.reference, status: q.status === "new" ? "replied" : "new" }, q.status === "new" ? "Marked as replied." : "Moved back to needs a reply.")}>
          {q.status === "new" ? "Mark replied" : "Mark as needing a reply"}</button></div>
      </article>)}
    </div>}
  </section>;
}
