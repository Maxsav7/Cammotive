"use client";
// Phone navigation sheet, adapted from the "Animated Sidebar" pattern (21st.dev,
// starc007): slides in from the edge, traps focus while open, locks page scroll,
// closes on Escape / scrim / link, returns focus to the menu button, and unfolds
// nested groups with a staggered reveal. Built on CSS transitions instead of a
// motion library; the global reduced-motion rule turns the movement off.
import { useEffect, useRef, useState, type RefObject } from "react";
import Logo from "./Logo";
import { googleProfileUrl } from "../lib/links";

type Link = { href: string; label: string };
type Group = { id: string; label: string; links: Link[] };

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function MobileMenu({ open, onClose, triggerRef, page, groups }: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  page: string;
  groups: Group[];
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<string | null>(() => groups.find(g => g.links.some(l => l.href === `/${page}`))?.id ?? null);
  const current = (href: string) => (href === "/" ? page === "home" : href === `/${page}`);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, overflow: body.style.overflow };
    Object.assign(body.style, { position: "fixed", top: `-${scrollY}px`, left: "0", right: "0", overflow: "hidden" });
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true }));
    const trigger = triggerRef.current;
    return () => {
      cancelAnimationFrame(frame);
      Object.assign(body.style, previous);
      window.scrollTo(0, scrollY);
      trigger?.focus({ preventScroll: true });
    };
  }, [open, triggerRef]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const item = (link: Link) => <a key={link.href} href={link.href} aria-current={current(link.href) ? "page" : undefined} onClick={onClose}>{link.label}</a>;

  return <div className={`menu-sheet ${open ? "open" : ""}`}>
    <button type="button" className="menu-scrim" aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={onClose} />
    <div ref={panel} id="mobile-nav" className="menu-panel" role="dialog" aria-modal="true" aria-label="Site menu" aria-hidden={!open} inert={!open} onKeyDown={onKeyDown}>
      <div className="menu-head">
        <a className="brand" href="/" onClick={onClose} aria-label="Camotive Detailing home"><Logo /></a>
        <button type="button" className="menu-close" aria-label="Close menu" onClick={onClose}>✕</button>
      </div>
      <nav className="menu-body" aria-label="Mobile navigation">
        {item({ href: "/", label: "Home" })}
        {groups.map(group => {
          const isOpen = expanded === group.id;
          return <div className={`menu-group ${isOpen ? "open" : ""}`} key={group.id}>
            <button type="button" aria-expanded={isOpen} aria-controls={`menu-${group.id}`} onClick={() => setExpanded(isOpen ? null : group.id)}>{group.label}<span aria-hidden="true">›</span></button>
            <div className="menu-sub" id={`menu-${group.id}`} hidden={!isOpen}>{group.links.map((link, i) => <a key={link.href} href={link.href} style={{ "--i": i } as React.CSSProperties} aria-current={current(link.href) ? "page" : undefined} onClick={onClose}>{link.label}</a>)}</div>
          </div>;
        })}
        {item({ href: "/our-work", label: "Our Work" })}
        <a href={googleProfileUrl} target="_blank" rel="noopener noreferrer" onClick={onClose}>Reviews<span className="sr-only"> on Google (opens in a new tab)</span></a>
        {item({ href: "/contact", label: "Contact" })}
        {item({ href: "/appointment", label: "My appointment" })}
      </nav>
      <div className="menu-foot">
        <a className="button" href="/book" onClick={onClose}>Book a detail</a>
        <a className="menu-phone" href="tel:+12105730671">Call or text (210) 573-0671</a>
      </div>
    </div>
  </div>;
}
