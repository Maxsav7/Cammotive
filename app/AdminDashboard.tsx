"use client";
// Cam's dashboard (/admin). Sign in with a 6-digit code emailed to the owner's
// address, then: upcoming jobs by day (call, text, directions, move, cancel with
// refund), the last 30 days, blocking off time, and quote requests.
// The session token is kept on this device for 7 days so Cam stays signed in on
// his phone; signing out removes it.
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import BookingChallenge from "./BookingChallenge";
import Logo from "./Logo";
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

  if (!status) return <section className="admin-gate"><p className="admin-muted">Loading…</p></section>;
  if (!status.dashboard) return <section className="admin-gate"><div className="signin-card"><Logo /><h1>Dashboard</h1>
    <p>The dashboard turns on once the booking database and email are connected (steps 1–5 in VERCEL.md).</p></div></section>;

  if (stage !== "dash") return <section className="admin-gate">
    {stage === "email" ? <form className="signin-card" onSubmit={requestCode}>
      <Logo /><h1>Dashboard sign-in</h1>
      <p>Enter the owner&apos;s email. We&apos;ll send a 6-digit code to sign in.</p>
      <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <BookingChallenge key={challenge} siteKey={status.siteKey!} action="recovery" onToken={setBotToken} />
      <button className="button" disabled={busy || !botToken}>{busy ? "Sending…" : "Email me a code"}</button>
    </form> : <form className="signin-card" onSubmit={verify}>
      <Logo /><h1>Enter your code</h1>
      <p>Sent to <strong>{email}</strong> if it&apos;s the owner&apos;s address. It expires in 15 minutes.</p>
      <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, ""))} className="code-input" /></label>
      <button className="button" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</button>
      <button type="button" className="text-button" onClick={() => { setStage("email"); setMessage(""); }}>Send a new code</button>
    </form>}
    {message && <p className="admin-toast" role="status">{message}</p>}
  </section>;

  const today = data!.today;
  const todayJobs = data!.upcoming.filter(j => j.date === today);
  const thisWeek = data!.upcoming.filter(j => j.date <= shift(today, 6)).length;
  const newQuotes = data!.quotes.filter(q => q.status === "new");
  const collect = (j: Job) => Math.max(0, j.total - (j.paid ? j.deposit : 0));
  const dayName = (date: string) => date === today ? "Today" : date === shift(today, 1) ? "Tomorrow" : fmt(date, { weekday: "long" });
  const shownQuotes = data!.quotes.filter(q => quoteFilter === "all" || q.status === "new");

  const jobCard = (j: Job, past = false) => <article key={j.code} className={`admin-job ${j.status}`} aria-labelledby={`${j.code}-h`}>
    <div className="job-time">
      <strong id={`${j.code}-h`}>{past ? `${fmt(j.date, { month: "short", day: "numeric" })} · ` : ""}{slotLabel[j.time] ?? j.time}</strong>
      {j.moved && <span className="badge">Moved</span>}
      {j.status === "cancelled" && <span className="badge badge-cancelled">{j.cancelledBy === "customer" ? "Customer cancelled" : "You cancelled"}{j.refunded ? " · refunded" : ""}</span>}
    </div>
    <div className="job-main">
      <p className="job-who"><strong>{j.name}</strong> <span>{j.vehicle}</span></p>
      <p className="job-what">{service(j)}</p>
      {!past && <a className="job-where" href={maps(j.address)} target="_blank" rel="noopener noreferrer">{j.address}</a>}
    </div>
    <div className="job-money">
      {j.status === "cancelled" ? <span className="admin-muted">{j.refunded ? `$${j.deposit} refunded` : j.paid ? `$${j.deposit} deposit kept` : "No deposit"}</span>
        : <><strong>${collect(j)}</strong><span>{past ? "collected on the day" : "to collect"}</span><small>${j.total} total · {j.paid ? `$${j.deposit} paid` : "no deposit"}</small></>}
    </div>
    {!past && <div className="job-actions">
      <a className="icon-button" href={`tel:${j.phone}`} aria-label={`Call ${j.name}, ${phone(j.phone)}`}><Icon d={icons.phone} />Call</a>
      <a className="icon-button" href={`sms:${j.phone}`} aria-label={`Text ${j.name}`}><Icon d={icons.text} />Text</a>
      <a className="icon-button" href={maps(j.address)} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${j.address}`}><Icon d={icons.pin} />Directions</a>
      <a className="icon-button icon-only" href={`mailto:${j.email}`} aria-label={`Email ${j.name}`} title={j.email}><Icon d={icons.mail} /></a>
      <span className="job-ref">{j.code}</span>
      {open?.code !== j.code && <>
        <button className="ghost-button" type="button" onClick={() => { setOpen({ code: j.code, kind: "move" }); setMoveTo({ date: j.date, time: "" }); setMessage(""); }}>Move</button>
        <button className="ghost-button danger" type="button" onClick={() => { setOpen({ code: j.code, kind: "cancel" }); setMessage(""); }}>Cancel &amp; refund</button>
      </>}
    </div>}
    {!past && open?.code === j.code && (open.kind === "cancel" ? <div className="job-panel danger" role="group" aria-label="Cancel this booking?">
      <p>Cancel {j.name.split(" ")[0]}&apos;s booking? {j.paid ? `The $${j.deposit} deposit is refunded automatically, ` : ""}they get an email, and the window opens up again.</p>
      <div className="job-panel-actions">
        <button className="button danger-button" type="button" disabled={busy} onClick={() => act({ action: "cancel", code: j.code }, "Cancelled and the customer has been emailed.")}>{busy ? "Cancelling…" : "Yes, cancel it"}</button>
        <button className="ghost-button" type="button" disabled={busy} onClick={() => setOpen(null)}>Keep it</button>
      </div>
    </div> : <form className="job-panel" onSubmit={e => { e.preventDefault(); if (moveTo.date && moveTo.time) act({ action: "reschedule", code: j.code, date: moveTo.date, time: moveTo.time }, "Moved. The customer has been emailed the new time with an updated invite."); }}>
      <label>New date<input type="date" required min={today} value={moveTo.date} onChange={e => setMoveTo({ date: e.target.value, time: "" })} /></label>
      <fieldset><legend>Window</legend><div className="admin-windows">
        {bookingTimes.map(t => {
          const state = moveSlots[t];
          const current = moveTo.date === j.date && t === j.time;
          return <label key={t} className={moveTo.time === t ? "selected" : ""}><input type="radio" name={`move-${j.code}`} value={t} disabled={current || Boolean(state && state !== "open")}
            checked={moveTo.time === t} onChange={() => setMoveTo({ ...moveTo, time: t })} />{slotLabel[t]}<small>{current ? "Current" : state === "taken" ? "Taken" : state === "unavailable" ? "Closed" : "Open"}</small></label>;
        })}
      </div></fieldset>
      <div className="job-panel-actions"><button className="button" disabled={busy || !moveTo.date || !moveTo.time}>{busy ? "Moving…" : "Move and email customer"}</button>
        <button className="ghost-button" type="button" onClick={() => setOpen(null)}>Never mind</button></div>
    </form>)}
  </article>;

  const quoteCard = (q: Quote) => <article key={q.reference} className={`admin-quote ${q.status}`}>
    <div className="quote-head"><strong>{q.service}</strong><span className={`badge ${q.status === "replied" ? "" : "badge-new"}`}>{q.status === "replied" ? "Replied" : "New"}</span></div>
    <p className="job-who"><strong>{q.name}</strong> <span>{q.vehicle}</span></p>
    <p className="quote-meta">{q.timing ? `${q.timing} · ` : ""}{new Date(q.receivedAt * 1000).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
    {q.notes && <p className="quote-notes">{q.notes}</p>}
    <div className="job-actions">
      <a className="icon-button" href={`tel:${q.phone}`} aria-label={`Call ${q.name}`}><Icon d={icons.phone} />Call</a>
      <a className="icon-button" href={`sms:${q.phone}`} aria-label={`Text ${q.name}`}><Icon d={icons.text} />Text</a>
      <a className="icon-button" href={`mailto:${q.email}?subject=${encodeURIComponent(`Your ${q.service.toLowerCase()} quote`)}`} aria-label={`Email ${q.name}`}><Icon d={icons.mail} />Email</a>
      <button className="ghost-button" type="button" disabled={busy} onClick={() => act({ action: "quote", reference: q.reference, status: q.status === "new" ? "replied" : "new" }, q.status === "new" ? "Marked as replied." : "Moved back to needs a reply.")}>
        {q.status === "new" ? "Mark replied" : "Mark as needing a reply"}</button>
    </div>
  </article>;

  return <section className="admin" data-tab={tab}>
    <header className="admin-bar">
      <a className="brand" href="/" aria-label="Camotive Detailing website"><Logo /></a>
      <h1 className="admin-bar-title">Dashboard</h1>
      <div className="admin-bar-actions">
        <button type="button" className="icon-button" disabled={busy} onClick={() => session && load(session)} aria-label="Refresh"><Icon d={icons.refresh} /><span className="label-wide">Refresh</span></button>
        <button type="button" className="ghost-button" onClick={() => signOut()}>Sign out</button>
      </div>
    </header>

    <div className="admin-body">
      <div className="admin-overview">
        <p className="admin-date">{fmt(today)}</p>
        <dl className="admin-stats">
          <div><dt>Today</dt><dd>{todayJobs.length} {todayJobs.length === 1 ? "job" : "jobs"}</dd><small>${todayJobs.reduce((n, j) => n + collect(j), 0)} to collect</small></div>
          <div><dt>Next 7 days</dt><dd>{thisWeek} {thisWeek === 1 ? "job" : "jobs"}</dd><small>{data!.upcoming.length} booked in total</small></div>
          <div><dt>Quotes</dt><dd>{newQuotes.length} waiting</dd><small>{newQuotes.length ? "need a reply" : "all caught up"}</small></div>
        </dl>
      </div>
      {!status.enabled && <p className="admin-note">Online booking isn&apos;t live yet. Blocking time already works: blocked windows show as taken on the booking page.</p>}

      <div className="admin-tabs" role="tablist" aria-label="Dashboard sections">
        {([["jobs", "Jobs"], ["quotes", `Quotes${newQuotes.length ? ` (${newQuotes.length})` : ""}`], ["time", "Time off"]] as const).map(([id, label]) =>
          <button key={id} role="tab" type="button" aria-selected={tab === id} className={tab === id ? "selected" : ""} onClick={() => { setTab(id); setMessage(""); setOpen(null); }}>{label}</button>)}
      </div>
      {message && <p className="admin-toast" role="status">{message}</p>}

      <div className="admin-grid">
        <div className="admin-panel panel-jobs" role="tabpanel" aria-label="Jobs">
          {days.length === 0 && <p className="admin-empty">No upcoming jobs. New bookings show up here as soon as they&apos;re paid.</p>}
          {days.map(([date, jobs]) => <section key={date} className="admin-day" aria-label={`${dayName(date)}, ${fmt(date)}`}>
            <h2><span>{dayName(date)}</span> {fmt(date, { month: "long", day: "numeric" })}<small>{jobs.length} {jobs.length === 1 ? "job" : "jobs"} · ${jobs.reduce((n, j) => n + collect(j), 0)} to collect</small></h2>
            {jobs.map(j => jobCard(j))}
          </section>)}
          {data!.recent.length > 0 && <details className="admin-recent"><summary>Last 30 days and cancelled ({data!.recent.length})</summary>{data!.recent.map(j => jobCard(j, true))}</details>}
        </div>

        <aside className="admin-side">
          <section className="admin-panel panel-quotes" role="tabpanel" aria-label="Quotes">
            <div className="side-head"><h2>Quote requests</h2>
              <div className="admin-filter">{(["new", "all"] as const).map(f => <button key={f} type="button" aria-pressed={quoteFilter === f} onClick={() => setQuoteFilter(f)}>{f === "new" ? "Needs a reply" : "All"}</button>)}</div></div>
            {shownQuotes.length === 0 ? <p className="admin-empty">{quoteFilter === "new" ? "All caught up." : "No quote requests yet."}</p> : shownQuotes.map(quoteCard)}
          </section>

          <section className="admin-panel panel-time" role="tabpanel" aria-label="Time off">
            <div className="side-head"><h2>Time off</h2></div>
            <form className="admin-block" onSubmit={e => { e.preventDefault(); if (block.date && block.times.length) act({ action: "block", date: block.date, times: block.times }, `Blocked ${fmt(block.date)}.`); }}>
              <label>Date<input type="date" required min={today} value={block.date} onChange={e => setBlock({ ...block, date: e.target.value })} /></label>
              <fieldset><legend>Block</legend><div className="admin-windows">
                {(["all", ...bookingTimes] as string[]).map(t => <label key={t} className={block.times.includes(t) ? "selected" : ""}>
                  <input type="checkbox" checked={block.times.includes(t)} onChange={() => setBlock({ ...block, times: t === "all" ? ["all"] : block.times.includes(t) ? block.times.filter(x => x !== t) : [...block.times.filter(x => x !== "all"), t] })} />
                  {t === "all" ? "Whole day" : slotLabel[t]}</label>)}
              </div></fieldset>
              <button className="button" disabled={busy || !block.date || !block.times.length}>{busy ? "Saving…" : "Block"}</button>
              <p className="admin-muted">Blocked windows show as taken on the booking page. Existing bookings aren&apos;t affected.</p>
            </form>
            {blockDays.length === 0 ? <p className="admin-empty">Nothing blocked.</p> : <ul className="admin-blocks">{blockDays.map(([date, times]) =>
              <li key={date}><strong>{fmt(date, { weekday: "short", month: "short", day: "numeric" })}</strong><div>{times.map(t => <span key={t} className="chip chip-static">{t === "all" ? "Whole day" : slotLabel[t] ?? t}
                <button type="button" aria-label={`Unblock ${t === "all" ? "whole day" : slotLabel[t]} on ${fmt(date)}`} disabled={busy} onClick={() => act({ action: "unblock", date, time: t }, "Unblocked.")}>×</button></span>)}</div></li>)}</ul>}
          </section>
        </aside>
      </div>
    </div>
  </section>;
}

// Small line icons (24px grid, drawn with the current text colour).
const icons = {
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  text: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
};
function Icon({ d }: { d: string }) {
  return <svg className="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
