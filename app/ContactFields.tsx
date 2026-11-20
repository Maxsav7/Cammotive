"use client";
// The mobile number and email inputs of the booking and quote forms, checked the
// same way the server checks them (lib/contact-checks.ts). A problem shows under its
// field once the customer leaves it or tries to go on; a likely email typo gets a
// one-tap fix; a valid number is tidied to (210) 393-1934. The server can add a
// problem of its own (an email domain that takes no email) as `note`.
import { emailProblem, emailSuggestion, formatPhone, phoneProblem } from "../lib/contact-checks";

export type ContactField = "phone" | "email";
export type ContactNote = { field: ContactField; message: string } | null;
export type Touched = Partial<Record<ContactField, boolean>>;

export function contactProblems(phone: string, email: string, note: ContactNote): Record<ContactField, string | null> {
  return {
    phone: note?.field === "phone" ? note.message : phoneProblem(phone),
    email: note?.field === "email" ? note.message : emailProblem(email),
  };
}

// The first field with a problem, after showing every problem; the caller stops there.
export function firstProblem(prefix: string, problems: Record<ContactField, string | null>, touch: (t: Touched) => void) {
  const field = problems.phone ? "phone" : problems.email ? "email" : null;
  if (field) { touch({ phone: true, email: true }); document.getElementById(`${prefix}-${field}`)?.focus(); }
  return field;
}

export default function ContactFields({ prefix, phone, email, onChange, touched, onTouch, note, clearNote }: {
  prefix: string; phone: string; email: string;
  onChange: (field: ContactField, value: string) => void;
  touched: Touched; onTouch: (field: ContactField) => void;
  note: ContactNote; clearNote: () => void;
}) {
  const problems = contactProblems(phone, email, note);
  const shown = (field: ContactField) => touched[field] ? problems[field] : null;
  const suggestion = problems.email ? null : emailSuggestion(email);
  const change = (field: ContactField, value: string) => { onChange(field, value); if (note?.field === field) clearNote(); };
  const described = (field: ContactField) => shown(field) ? { "aria-invalid": true, "aria-describedby": `${prefix}-${field}-note` } : {};
  return <>
    <label>Mobile number<input id={`${prefix}-phone`} name="phone" type="tel" autoComplete="tel" required maxLength={30} value={phone} placeholder="(210) 000-0000"
      {...described("phone")} onChange={e => change("phone", e.target.value)}
      onBlur={() => { onTouch("phone"); if (!phoneProblem(phone)) onChange("phone", formatPhone(phone)); }} />
      {shown("phone") && <small className="field-note" id={`${prefix}-phone-note`}>{shown("phone")}</small>}</label>
    <label>Email<input id={`${prefix}-email`} name="email" type="email" autoComplete="email" required maxLength={254} value={email}
      {...described("email")} onChange={e => change("email", e.target.value)} onBlur={() => onTouch("email")} />
      {shown("email")
        ? <small className="field-note" id={`${prefix}-email-note`}>{shown("email")}</small>
        : suggestion && <small className="field-hint">Did you mean <button type="button" className="text-button" onClick={() => change("email", suggestion)}>{suggestion}</button>?</small>}</label>
  </>;
}
