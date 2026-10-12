"use client";
// Interactive card, adapted from the "Interactive 3D Analytics Dashboard Card"
// (21st.dev, dhileepkumargm): a subtle perspective tilt (max 5°) and lift that
// follow the mouse, plus a soft highlight under the cursor, easing back on leave.
// Mouse/pen only — touch scrolling never tilts — and skipped entirely when the
// visitor prefers reduced motion. Pure CSS variables; no animation library.
import { useRef, type AllHTMLAttributes, type ElementType, type PointerEvent } from "react";

const MAX_TILT = 5;

export default function TiltCard({ as: Tag = "article", className = "", children, ...props }: AllHTMLAttributes<HTMLElement> & { as?: ElementType }) {
  const ref = useRef<HTMLElement>(null);
  const frame = useRef(0);

  function enabled(event: PointerEvent) {
    return event.pointerType !== "touch" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function move(event: PointerEvent<HTMLElement>) {
    if (!enabled(event)) return;
    const el = event.currentTarget;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;  // 0..1
      const y = (clientY - rect.top) / rect.height;  // 0..1
      el.style.setProperty("--tilt-x", `${(0.5 - y) * 2 * MAX_TILT}deg`);
      el.style.setProperty("--tilt-y", `${(x - 0.5) * 2 * MAX_TILT}deg`);
      el.style.setProperty("--glow-x", `${x * 100}%`);
      el.style.setProperty("--glow-y", `${y * 100}%`);
      el.dataset.tilting = "true";
    });
  }

  function leave() {
    cancelAnimationFrame(frame.current);
    const el = ref.current;
    if (!el) return;
    delete el.dataset.tilting;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  }

  return <Tag ref={ref} className={`tilt-card ${className}`} onPointerMove={move} onPointerLeave={leave} {...props}>{children}</Tag>;
}
