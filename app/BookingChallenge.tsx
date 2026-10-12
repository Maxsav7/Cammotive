"use client";
import { useEffect, useRef, useState } from "react";
type Turnstile = { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }
let scriptReady: Promise<void> | undefined;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptReady) scriptReady = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true; script.onload = () => resolve(); script.onerror = () => { script.remove(); reject(new Error("Security check unavailable")); };
    document.head.appendChild(script);
  }).catch(error => { scriptReady = undefined; throw error; });
  return scriptReady;
}
export default function BookingChallenge({ siteKey, action, onToken }: { siteKey: string; action: "booking" | "recovery"; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null); const [error, setError] = useState(false);
  useEffect(() => {
    let active = true; let id: string | undefined;
    loadScript().then(() => {
      if (!active || !container.current || !window.turnstile) return;
      id = window.turnstile.render(container.current, { sitekey: siteKey, action, callback: onToken,
        "expired-callback": () => onToken(""), "error-callback": () => { onToken(""); setError(true); } });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (id) window.turnstile?.remove(id); };
  }, [siteKey, action, onToken]);
  return <div><div ref={container} />{error && <p role="alert">Security check unavailable. Refresh or call (210) 573-0671.</p>}</div>;
}
