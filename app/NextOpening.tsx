"use client";
// "Next opening" line under the hero buttons, read from live availability.
import { useEffect, useState } from "react";

export default function NextOpening() {
  const [next, setNext] = useState<{ date: string; time: string } | null>(null);
  useEffect(() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
    fetch(`/api/availability?from=${today}&days=30`, { cache: "no-store" }).then(r => r.json()).then(data => {
      if (!data.days?.length) return;
      for (const day of data.days) { const slot = day.slots.find((s: { state: string }) => s.state === "open"); if (slot) { setNext({ date: day.date, time: slot.time }); return; } }
    }).catch(() => {});
  }, []);
  if (!next) return null;
  const label = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${next.date}T12:00:00Z`));
  return <a className="next-opening" href={`/book?date=${next.date}&time=${encodeURIComponent(next.time)}`}><span aria-hidden="true" />Next opening: {label}, {next.time}</a>;
}
