"use client";
// Ceramic coating results: the client's Mach-E walk-around as a feature video,
// finished vehicles in a gallery, and a glass coating clip.
import { useEffect, useRef } from "react";
import TiltCard from "./TiltCard";

const photos = [
  ["mach-e-front", "Mustang Mach-E GT — ceramic coated, front"],
  ["mach-e-side", "Mustang Mach-E GT — ceramic coated, profile"],
  ["maverick-front", "Ford Maverick — ceramic coated"],
  ["mercedes-cla-rear", "Mercedes-Benz CLA — ceramic coated"],
] as const;

// Plays the muted feature loop only while it is on screen, and never for visitors
// who prefer reduced motion (they get the poster and standard controls instead).
function AmbientVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.muted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.controls = true; return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) el.play().catch(() => { el.controls = true; });
      else el.pause();
    }, { threshold: 0.35 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <video ref={video} className="showcase-video" loop muted playsInline preload="metadata" poster={poster} aria-label={label}>
    <source src={src} type="video/mp4" />
  </video>;
}

export default function CoatingShowcase() {
  return <section className="section coating-showcase" aria-labelledby="coating-results">
    <div className="showcase-intro">
      <div className="showcase-feature">
        <AmbientVideo src="/work/mach-e-ceramic.mp4" poster="/work/mach-e-ceramic.jpg" label="Walk-around of a ceramic coated Mustang Mach-E GT" />
      </div>
      <div className="coating-copy showcase-copy">
        <p className="eyebrow">Coating results</p>
        <h2 id="coating-results">Depth you can see in daylight.</h2>
        <p>A properly prepared, coated finish reflects cleanly, sheds water, and makes every wash easier. Below are recent Camotive coating clients.</p>
        <ul>
          <li>Paint decontaminated and prepared before any coating</li>
          <li>3-year and 5-year ceramic options</li>
          <li>Glass coating for windshields and exterior glass</li>
        </ul>
        <div className="hero-actions"><a className="button" href="/contact#quote">Get a coating quote ↗</a><a className="text-link" href="#pricing">See coating packages →</a></div>
      </div>
    </div>
    <div className="showcase-grid">
      {photos.map(([file, caption]) => <TiltCard as="figure" key={file} className="showcase-card">
        <a href={`/work/${file}.jpg`} target="_blank" rel="noopener noreferrer" aria-label={`View full photo: ${caption} (opens in a new tab)`}><img src={`/work/${file}.jpg`} alt={caption} width="1200" height="1600" loading="lazy" decoding="async" /></a>
        <figcaption>{caption}</figcaption>
      </TiltCard>)}
      <TiltCard as="figure" className="showcase-card">
        <video controls playsInline preload="none" poster="/work/glass-coating.jpg" aria-label="Glass coating being applied to a side window"><source src="/work/glass-coating.mp4" type="video/mp4" /></video>
        <figcaption>Glass coating application</figcaption>
      </TiltCard>
    </div>
  </section>;
}
