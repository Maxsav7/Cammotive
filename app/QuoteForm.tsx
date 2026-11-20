"use client";
// Quote requests for work Cam assesses first (ceramic coating, paint correction,
// anything else). Without the online system configured it still works: the details are
// composed into a text message to Cam.
import { FormEvent, useEffect, useState } from "react";
import BookingChallenge from "./BookingChallenge";
import ContactFields, { contactProblems, firstProblem, type ContactField, type ContactNote, type Touched } from "./ContactFields";
import { quoteServices } from "../lib/booking-catalog";

type Service = keyof typeof quoteServices;
const PHONE = "(210) 573-0671";

export default function QuoteForm() {
  const [status, setStatus] = useState<{ enabled: boolean; siteKey?: string | null } | null>(null);
  const [form, setForm] = useState({ service: "ceramic" as Service, vehicle: "", name: "", phone: "", email: "", timing: "", notes: "" });
  const [botToken, setBotToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [touched, setTouched] = useState<Touched>({});
  const [contactNote, setContactNote] = useState<ContactNote>(null);

  useEffect(() => {
    fetch("/api/appointments/status", { cache: "no-store" }).then(r => r.json()).then(setStatus).catch(() => setStatus({ enabled: false }));
    const service = new URLSearchParams(window.location.search).get("service");
    if (service && service in quoteServices) setForm(f => ({ ...f, service: service as Service }));
  }, []);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!status?.enabled) {
      const body = `Quote request: ${quoteServices[form.service]}\nVehicle: ${form.vehicle}\nName: ${form.name}\nTiming: ${form.timing || "Flexible"}\n${form.notes}`;
      window.location.href = `sms:+12105730671?&body=${encodeURIComponent(body)}`;
      return;
    }
    if (busy || !botToken || firstProblem("quote", contactProblems(form.phone, form.email, contactNote), setTouched)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, turnstileToken: botToken }) });
      const result = await response.json();
      if (!response.ok && (result.field === "email" || result.field === "phone")) {
        const field: ContactField = result.field;
        setContactNote({ field, message: result.error }); setTouched(t => ({ ...t, [field]: true }));
        document.getElementById(`quote-${field}`)?.focus();
        return;
      }
      if (!response.ok) { setError(result.error || `Couldn't send your request. Please text ${PHONE}.`); return; }
      setSent(result.reference);
    } catch { setError(`Connection interrupted. Try again, or text ${PHONE}.`); }
    finally { setBusy(false); setBotToken(""); setChallenge(v => v + 1); }
  }

  if (sent) return <div className="quote-done" role="status">
    <p className="eyebrow">Request received</p>
    <h3>We&apos;ll reply within one business day.</h3>
    <p>Reference {sent}. We&apos;ve emailed you a copy. Photos help us quote accurately: text a few clear daylight photos of the vehicle to <a className="text-link" href="sms:+12105730671">{PHONE}</a>.</p>
  </div>;

  return <form className="quote-form" onSubmit={submit}>
    <fieldset className="quote-services"><legend>What would you like quoted?</legend>
      {(Object.keys(quoteServices) as Service[]).map(id => <label key={id} className={form.service === id ? "selected" : ""}><input type="radio" name="service" value={id} checked={form.service === id} onChange={set("service")} />{quoteServices[id]}</label>)}
    </fieldset>
    <div className="form-grid">
      <label className="wide">Vehicle<input required minLength={3} maxLength={120} value={form.vehicle} onChange={set("vehicle")} placeholder="Year, make, model and color" /></label>
      <label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={form.name} onChange={set("name")} /></label>
      <ContactFields prefix="quote" phone={form.phone} email={form.email} onChange={(field, value) => setForm(f => ({ ...f, [field]: value }))}
        touched={touched} onTouch={field => setTouched(t => ({ ...t, [field]: true }))} note={contactNote} clearNote={() => setContactNote(null)} />
      <label><span>Preferred timing <span className="optional">Optional</span></span><input maxLength={200} value={form.timing} onChange={set("timing")} placeholder="For example: weekends in November" /></label>
      <label className="wide"><span>Anything we should know? <span className="optional">Optional</span></span><textarea rows={4} maxLength={1500} value={form.notes} onChange={set("notes")} placeholder="Paint condition, swirls or scratches you've noticed, where the car is parked" /></label>
    </div>
    {status?.enabled && <BookingChallenge key={challenge} siteKey={status.siteKey!} action="quote" onToken={setBotToken} />}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="quote-actions">
      <button className="button" type="submit" disabled={status === null || (status.enabled && (busy || !botToken))}>{status && !status.enabled ? "Send by text message" : busy ? "Sending…" : "Request a quote"}</button>
      <p>We reply within one business day. Photos help: you&apos;ll be able to text them after sending.</p>
    </div>
  </form>;
}
