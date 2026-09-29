"use client";

import Script from "next/script";
import { FormEvent, useEffect, useMemo, useState } from "react";

type PackageId = "full" | "premium" | "maintenance" | "ceramic3" | "ceramic5";
type AddOnId = "windshield" | "glass" | "headlight" | "engine";
type VehicleSize = "small" | "medium" | "large";

const packages = {
  full: {
    name: "Full Detail",
    prices: { small: 250, medium: 300, large: 350 },
    note: "A complete interior and exterior reset for normally maintained vehicles.",
    features: ["Hand wash, wheels and tires", "Vacuum seats, carpets, mats and cargo", "Interior surfaces cleaned and protected", "No added paint sealant"],
  },
  premium: {
    name: "Premium Detail",
    prices: { small: 350, medium: 425, large: 500 },
    note: "A deeper clean with added paint protection for vehicles needing more care.",
    features: ["Everything in Full Detail", "Fabric shampoo or extraction", "Leather or Alcantara treatment", "Decontamination + 3–6 month sealant"],
  },
  maintenance: {
    name: "Maintenance Detail",
    prices: { small: 125, medium: 150, large: 175 },
    note: "Returning clients serviced every 2–4 weeks only.",
    features: ["Hand wash and wheel care", "Tire dressing", "Interior vacuum and wipe-down", "Interior and exterior glass"],
  },
  ceramic3: {
    name: "3-Year Ceramic Coating",
    prices: { small: 900, medium: 1050, large: 1200 },
    note: "Nasiol ZR53 for gloss, easier maintenance, and up to three years of protection.",
    features: ["Prep wash + decontamination", "Panel preparation", "Nasiol ZR53 application", "Paint correction quoted separately"],
  },
  ceramic5: {
    name: "5-Year Ceramic Coating",
    prices: { small: 1300, medium: 1500, large: 1700 },
    note: "Graphene ceramic protection with a light gloss polish for added clarity.",
    features: ["Prep wash + decontamination", "Light gloss polish", "Panel preparation", "Paint correction quoted separately"],
  },
} as const;

const addOns = {
  windshield: ["Windshield glass coating", 125],
  glass: ["All exterior glass coating", 225],
  headlight: ["Headlight restoration (pair)", 100],
  engine: ["Engine bay cleaning", 75],
} as const;

const googleProfileUrl = "https://www.google.com/search?q=camotive+detailing+san+antonio&ludocid=11765857279964552273";

const times = ["8:00 AM", "10:30 AM", "1:30 PM", "4:00 PM"];

function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function BookingCalendar({ value, minimum, onChange }: { value: string; minimum: string; onChange: (value: string) => void }) {
  const [month, setMonth] = useState(() => new Date(`${value || minimum}T12:00:00`));
  const year = month.getFullYear();
  const index = month.getMonth();
  const firstDay = new Date(year, index, 1).getDay();
  const days = new Date(year, index + 1, 0).getDate();
  const firstAllowed = new Date(`${minimum}T12:00:00`);
  const canGoBack = year * 12 + index > firstAllowed.getFullYear() * 12 + firstAllowed.getMonth();
  return <div className="calendar" aria-label="Appointment calendar">
    <div className="calendar-header"><button type="button" disabled={!canGoBack} aria-label="Previous month" onClick={() => setMonth(new Date(year, index - 1, 1))}>‹</button><strong aria-live="polite">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Next month" onClick={() => setMonth(new Date(year, index + 1, 1))}>›</button></div>
    <div className="calendar-days">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => <span key={day}>{day}</span>)}
      {Array.from({ length: firstDay }, (_, i) => <span key={`empty-${i}`} aria-hidden="true" />)}
      {Array.from({ length: days }, (_, i) => { const day = i + 1; const key = `${year}-${String(index + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; return <button type="button" key={key} disabled={key < minimum} aria-label={new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} aria-pressed={value === key} className={value === key ? "selected" : ""} onClick={() => onChange(key)}>{day}</button>; })}
    </div>
  </div>;
}

export default function Site({ page = "home" }: { page?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [menu, setMenu] = useState<"services" | "locations" | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [category, setCategory] = useState<"detailing" | "ceramic">(page === "ceramic-coating" ? "ceramic" : "detailing");
  const [scrolled, setScrolled] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [selectedPackage, setSelectedPackage] = useState<PackageId>("full");
  const [vehicleSize, setVehicleSize] = useState<VehicleSize>("small");
  const [selectedAddOns, setSelectedAddOns] = useState<AddOnId[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [step, setStep] = useState(1);
  const [booking, setBooking] = useState<Record<string, string> | null>(null);
  const [lookupCode, setLookupCode] = useState("");
  const [lookupResult, setLookupResult] = useState<Record<string, string> | null>(null);
  const reviewSummary = { rating: 5, count: 7, profileUrl: googleProfileUrl };
  const [bookingError, setBookingError] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("camotive-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenu(null); setMobileMenu(false); } };
    window.addEventListener("keydown", onEscape);
    const query = new URLSearchParams(window.location.search);
    const requested = query.get("service") as PackageId;
    if (requested && requested in packages) setSelectedPackage(requested);
    const size = query.get("size");
    if (size === "small" || size === "medium" || size === "large") setVehicleSize(size);
    const extra = query.get("addon") as AddOnId;
    if (extra && extra in addOns) setSelectedAddOns([extra]);
    if (page === "ceramic-coating") setCategory("ceramic");
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("keydown", onEscape); };
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { window.localStorage.setItem("camotive-theme", next); } catch {}
  }

  const total = useMemo(
    () => packages[selectedPackage].prices[vehicleSize] + selectedAddOns.reduce((sum, id) => sum + addOns[id][1], 0),
    [selectedPackage, selectedAddOns, vehicleSize],
  );

  const earliest = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    return next.toISOString().slice(0, 10);
  }, []);

  function scrollTo(id: string) {
    setMenu(null);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  function toggleAddOn(id: AddOnId) {
    setSelectedAddOns((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBookingError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      packageId: selectedPackage,
      packageName: `${packages[selectedPackage].name} · ${vehicleSize[0].toUpperCase()}${vehicleSize.slice(1)}`,
      addOns: selectedAddOns.map((id) => addOns[id][0]).join(", "),
      date,
      time,
      total: String(total),
      name: String(form.get("name")),
      email: String(form.get("email")),
      phone: String(form.get("phone")),
      vehicle: String(form.get("vehicle")),
      address: String(form.get("address")),
      reminder: String(form.get("reminder")),
    };
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.confirmationCode) {
      setBookingError("We couldn’t complete the booking. Please call or text (210) 573-0671.");
      return;
    }
    setBooking({
      ...payload,
      confirmationCode: result.confirmationCode,
      notificationStatus: result.notifications?.configured ? "sent" : "pending",
    });
    setStep(4);
  }

  async function lookupAppointment(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/appointments?code=${encodeURIComponent(lookupCode)}`);
    const result = await response.json();
    setLookupResult(result.appointment ?? null);
    setLookupError(result.appointment ? "" : "No appointment found. Check the code or call Camotive for help.");
  }


  const isHome = page === "home";
  const areas = [["stone-oak", "Stone Oak"], ["alamo-heights", "Alamo Heights"], ["the-dominion", "The Dominion"], ["leon-springs", "Leon Springs"], ["downtown", "Downtown San Antonio"]];
  const currentArea = areas.find(([slug]) => slug === page);
  const titles: Record<string, [string, string]> = {
    "mobile-detailing": ["Mobile detailing in San Antonio", "Interior, exterior, and complete detailing at your home or workplace. Choose the level of care your vehicle needs."],
    "ceramic-coating": ["Ceramic coating. Lasting protection.", "Careful preparation and durable ceramic protection for gloss, easier washing, and a finish you can enjoy every day."],
    "paint-correction": ["Bring clarity back to your paint.", "Paint enhancement polishing and correction tailored to your vehicle’s finish. Contact Cam for an assessment and a quote."],
    locations: ["Mobile detailing, closer to home.", "Serving San Antonio homes and workplaces. Explore our service areas or contact Cam to confirm your location."],
    "our-work": ["See the details for yourself.", "Explore Camotive’s actual detailing projects and videos on Instagram and TikTok."],
    reviews: ["What our customers say.", "Read customer feedback from Camotive Detailing’s Google business profile."],
    contact: ["Let’s talk about your vehicle.", "Questions about a service, your location, or paint condition? Call or text Cam directly."],
    book: ["Schedule your detail.", "Choose a service, a date, and a time. Your appointment details are saved after you complete the booking."],
    appointment: ["Your next detail, at a glance.", "Find your saved appointment using your confirmation code."]
  };
  const title = currentArea ? [`Mobile detailing in ${currentArea[1]}.`, "Professional interior and exterior care, ceramic protection, and paint enhancement at your location."] : titles[page];
  const navLinks = [
    { href: "/mobile-detailing", title: "Mobile Detailing", sub: "We come to you" },
    { href: "/ceramic-coating", title: "Ceramic Coating", sub: "Long-term paint protection" },
    { href: "/paint-correction", title: "Paint Correction", sub: "Restore gloss and clarity" }
  ];
  const pricing = <section className="section pricing-section" id="pricing">
    <div className="section-heading centered"><p className="eyebrow">Pricing & packages</p><h2>Find the right care for your car.</h2><p>Choose your service and vehicle size. Final pricing is confirmed before work begins.</p></div>
    <div className="pricing-notice">Mobile service throughout San Antonio <a href="/book">Schedule online →</a></div>
    <div className="pricing-step"><span>1</span><div><h3>Choose your service</h3><p>Select a category to explore the packages.</p></div></div>
    <div className="category-tabs" role="tablist" aria-label="Service category">
      <button id="detail-tab" role="tab" aria-selected={category === "detailing"} aria-controls="packages-panel" tabIndex={category === "detailing" ? 0 : -1} onKeyDown={e => {if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();setCategory("ceramic");document.getElementById("ceramic-tab")?.focus();}}} className={category === "detailing" ? "selected" : ""} onClick={() => setCategory("detailing")}><strong>Mobile Detailing</strong><small>Interior, exterior & maintenance</small></button>
      <button id="ceramic-tab" role="tab" aria-selected={category === "ceramic"} aria-controls="packages-panel" tabIndex={category === "ceramic" ? 0 : -1} onKeyDown={e => {if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();setCategory("detailing");document.getElementById("detail-tab")?.focus();}}} className={category === "ceramic" ? "selected" : ""} onClick={() => setCategory("ceramic")}><strong>Ceramic Coating</strong><small>Preparation, gloss & protection</small></button>
    </div>
    <div className="pricing-step"><span>2</span><div><h3>Compare packages</h3><p>All prices shown are starting estimates.</p></div><label className="price-size">Vehicle size<select value={vehicleSize} onChange={e => setVehicleSize(e.target.value as VehicleSize)}><option value="small">Small · coupe / sedan</option><option value="medium">Medium · crossover / small truck</option><option value="large">Large · SUV / full-size truck</option></select></label></div>
    <div id="packages-panel" role="tabpanel" aria-labelledby={category === "detailing" ? "detail-tab" : "ceramic-tab"} className={`price-grid ${category === "ceramic" ? "two" : ""}`}>
      {(category === "detailing" ? ["full", "premium", "maintenance"] : ["ceramic3", "ceramic5"]).map(key => {const id=key as PackageId;const item=packages[id];return <article className={`price-card ${id === "premium" ? "highlight" : ""}`} key={id}>{id === "premium" && <span className="popular">Deep clean + protection</span>}<h3>{item.name}</h3><p>{item.note}</p><div className="price"><small>From</small><strong>${item.prices[vehicleSize]}</strong></div><ul>{item.features.map(f => <li key={f}><span>✓</span>{f}</li>)}</ul><a className="button" href={`/book?service=${id}&size=${vehicleSize}`}>Schedule online <span>→</span></a><a className="price-phone" href="tel:+12105730671">(210) 573-0671</a></article>;})}
    </div>
    <div className="pricing-step"><span>3</span><div><h3>Make it your detail</h3><p>Optional upgrades available during booking.</p></div></div>
    <div className="add-on-catalog">{Object.entries(addOns).map(([id,[name,price]])=><a key={id} href={`/book?addon=${id}`}><span>{name}</span><strong>${price} <span>↗</span></strong></a>)}</div>
    <p className="menu-notes">Excessive pet hair or sand removal starts at $50. Severe stains, smoke, urine, mildew, paint correction, and unusually neglected vehicles require a separate quote.</p>
  </section>;
  const coverage = <section className="section coverage" id="coverage"><div className="section-heading centered"><p className="eyebrow">San Antonio, Texas</p><h2>Professional care. Local convenience.</h2><p>Choose your neighborhood to learn about mobile service in your area.</p></div><div className="location-grid">{areas.map(([slug,name])=><a href={`/${slug}`} key={slug}><span className="location-marker">⌖</span><h3>{name}</h3><p>Mobile detailing & ceramic protection</p><span className="area-link">Explore service area →</span></a>)}</div><p className="coverage-note">Outside these areas? <a href="/contact">Contact Cam</a> to check availability.</p></section>;
  const reviews = <section className="section reviews" id="reviews"><Script src="https://elfsightcdn.com/platform.js" strategy="lazyOnload" /><div className="section-heading centered"><p className="eyebrow">Google reviews</p><h2>Real feedback. Carefully earned.</h2><p>What customers say about their experience with Camotive.</p></div><div className="elfsight-review-shell"><div className="elfsight-app-1a419f21-0cfe-481d-972c-8b2baeacf0dc" data-elfsight-app-lazy /></div><a className="google-link" href={googleProfileUrl} target="_blank" rel="noreferrer">Read all reviews on Google ↗</a></section>;
  const process = <section className="section process"><div className="section-heading centered"><p className="eyebrow">The mobile detailing process</p><h2>Great care, without the extra trip.</h2><p>A straightforward way to keep your vehicle looking its best.</p></div><div className="process-grid">{[["Choose your service","Select a detail or protection package that suits your vehicle."],["Choose your time","Enter your preferred date, time, and service address."],["We come to you","Camotive takes care of the detail at your agreed location."]].map(([name,desc],i)=><article key={name}><span>{i+1}</span><h3>{name}</h3><p>{desc}</p></article>)}</div><a className="button" href="/book">Schedule online →</a></section>;
  return (
    <main className={`site-shell ${isHome ? "home-page" : "inner-page"}`} data-theme={theme}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="header-wrap">
        <div className="announcement"><span /> Mobile detailing, ceramic coatings & paint enhancement — we come to you across San Antonio</div>
        <header className={`site-header ${scrolled || !isHome || mobileMenu ? "solid" : ""}`}>
          <a className="brand" href="/" aria-label="Camotive home"><img src="/camotive-logo-original.png" alt="Camotive Detailing" /></a>
          <nav className="desktop-nav" aria-label="Main navigation">
            <a href="/" aria-current={isHome ? "page" : undefined}>Home</a>
            <div className="nav-dropdown" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setMenu(null);}}>
              <button aria-expanded={menu==="services"} aria-controls="service-menu" onClick={()=>setMenu(menu==="services"?null:"services")}>Services <span>⌄</span></button>
              {menu==="services" && <div className="dropdown-panel" id="service-menu">{navLinks.map(l=><a key={l.href} href={l.href}><strong>{l.title}</strong><small>{l.sub}</small></a>)}</div>}
            </div>
            <div className="nav-dropdown" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setMenu(null);}}>
              <button aria-expanded={menu==="locations"} aria-controls="location-menu" onClick={()=>setMenu(menu==="locations"?null:"locations")}>Locations <span>⌄</span></button>
              {menu==="locations" && <div className="dropdown-panel" id="location-menu">{areas.map(([slug,name])=><a href={`/${slug}`} key={slug}>{name}</a>)}<a href="/locations"><strong>All service areas →</strong></a></div>}
            </div>
            <a href="/our-work" aria-current={page==="our-work"?"page":undefined}>Our Work</a><a href="/reviews" aria-current={page==="reviews"?"page":undefined}>Reviews</a><a href="/contact" aria-current={page==="contact"?"page":undefined}>Contact</a>
          </nav>
          <div className="header-actions"><button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme==="dark"?"light":"dark"} mode`}>{theme==="dark"?"☼":"☾"}</button><a className="header-phone" href="tel:+12105730671">☎ (210) 573-0671</a><a className="button button-small" href="/book">Schedule online</a><button className="mobile-toggle" aria-expanded={mobileMenu} aria-controls="mobile-nav" aria-label={mobileMenu?"Close navigation":"Open navigation"} onClick={()=>setMobileMenu(!mobileMenu)}>{mobileMenu?"✕":"☰"}</button></div>
        </header>
        {mobileMenu && <nav className="mobile-nav" id="mobile-nav" aria-label="Mobile navigation"><a href="/">Home</a><details><summary>Services</summary>{navLinks.map(l=><a key={l.href} href={l.href}>{l.title}</a>)}</details><details><summary>Locations</summary>{areas.map(([slug,name])=><a key={slug} href={`/${slug}`}>{name}</a>)}<a href="/locations">All locations</a></details><a href="/our-work">Our Work</a><a href="/reviews">Reviews</a><a href="/contact">Contact</a><a href="/appointment">My appointment</a><a className="button" href="/book">Schedule online</a></nav>}
      </div>
      <div id="main-content">
      {isHome ? <>
        <section className="hero" id="home"><img className="hero-photo" src="/detailing-hero.jpg" alt="Close-up of professional paint polishing on a black sports car" fetchPriority="high" /><div className="hero-shade"/><div className="hero-copy"><p className="hero-location"><span/> San Antonio, Texas · Mobile service</p><h1>Mobile Detailing and<br className="desktop-break"/> Ceramic Coating<br className="desktop-break"/> in San Antonio, TX</h1><p className="hero-lede">Interior and exterior detailing, ceramic protection, and paint enhancement—at your home or workplace.</p><div className="hero-actions"><a className="button" href="/book">Schedule online <span>→</span></a><a className="outline-button" href="/contact#quote">Get a quote ↗</a></div><a className="hero-rating" href="/reviews"><b className="google-g">G</b><strong>5.0</strong><span>★★★★★</span><small>Google reviews</small></a></div></section>
        <section className="section services" id="services"><div className="section-heading centered"><p className="eyebrow">Our services</p><h2>A fresh start. A lasting finish.</h2><p>Complete mobile details and ceramic protection, with professional care at every step.</p></div><div className="service-cards">
          <article className="service-card"><a className="service-image" href="/mobile-detailing"><img src="/detailing-hero.jpg" alt="Automotive detailing and paint care" loading="lazy"/><span>Mobile</span></a><div className="service-body"><h3>Mobile Detailing</h3><p>Interior, exterior, and complete care for your daily driver or weekend vehicle, wherever it fits your day.</p><ul><li>Full, premium & maintenance details</li><li>Home or workplace appointments</li><li>Simple online scheduling</li></ul><div className="card-actions"><a className="button" href="/book">Schedule online →</a><a className="text-link" href="/mobile-detailing">Explore services ↗</a></div></div></article>
          <article className="service-card contrast"><a className="service-image" href="/ceramic-coating"><img src="/paint-polishing.jpg" alt="Machine polishing a vehicle’s paint" loading="lazy"/><span>Paint protection</span></a><div className="service-body"><h3>Ceramic Coating</h3><p>Careful paint preparation and long-term ceramic protection for a deep gloss and easier maintenance.</p><ul><li>3-year ceramic coating from $900</li><li>5-year ceramic coating from $1,300</li><li>Paint correction quoted separately</li></ul><div className="card-actions"><a className="button" href="/book?service=ceramic3">Schedule online →</a><a className="text-link" href="/ceramic-coating">Explore coatings ↗</a></div></div></article>
        </div></section>
        <section className="section convenience"><div className="section-heading centered"><p className="eyebrow">We come to you</p><h2>Your schedule. Your location.</h2><p>Professional detailing that works around your day, across San Antonio.</p></div><div className="convenience-grid">{[["⌂","Home","Enjoy a detail without leaving your driveway."],["▣","Workplace","Let us care for your vehicle while you work."],["▥","Apartment","Contact us to confirm access and property permission."],["⌖","Approved location","We’ll help confirm a suitable place for your service."]].map(([icon,name,desc])=><a href="/locations" key={name}><span className="place-icon">{icon}</span><h3>{name}</h3><p>{desc}</p><span className="place-arrow">→</span></a>)}</div></section>
        <section className="coating-feature"><div className="coating-image"><img src="/paint-polishing.jpg" alt="Polishing and preparing paint for protection" loading="lazy"/></div><div className="coating-copy"><p className="eyebrow">Ceramic protection</p><h2>Gloss you can see.<br/>Protection that lasts.</h2><p>Give your paint a carefully prepared finish and a layer of protection designed for easier upkeep.</p><ul><li>3-year and 5-year coating options</li><li>Preparation tailored to your paint condition</li><li>Gloss enhancement and easier maintenance</li><li>Paint correction available by quote</li></ul><div className="hero-actions"><a className="button" href="/contact#quote">Get a quote ↗</a><a className="text-link" href="/paint-correction">Explore paint correction →</a></div></div></section>
        {pricing}{process}{reviews}{coverage}
      </> : <section className="inner-hero"><div className="inner-hero-copy"><a className="breadcrumb" href="/">Home /</a><p className="eyebrow">Camotive Detailing · San Antonio</p><h1>{title?.[0]}</h1><p>{title?.[1]}</p>{page!=="book"&&page!=="appointment"&&<div className="hero-actions"><a className="button" href="/book">Schedule online →</a><a className="outline-button" href="tel:+12105730671">Call Camotive</a></div>}</div>{["mobile-detailing","ceramic-coating","paint-correction"].includes(page)&&<img src={page==="mobile-detailing"?"/detailing-hero.jpg":"/paint-polishing.jpg"} alt="Professional vehicle paint care" />}</section>}
      {["mobile-detailing","ceramic-coating"].includes(page) && <>{pricing}{process}</>}
      {page==="paint-correction" && <section className="section correction-content"><div className="section-heading centered"><p className="eyebrow">Paint assessment</p><h2>Preparation makes the difference.</h2><p>Polishing can improve gloss and the appearance of surface defects. Cam will assess your finish before recommending the right approach.</p></div><div className="process-grid">{[["Evaluate","Discuss the vehicle’s condition and your desired result."],["Enhance","Choose an appropriate polish or correction level."],["Protect","Pair the prepared finish with a suitable coating."]].map(([h,p],i)=><article key={h}><span>{i+1}</span><h3>{h}</h3><p>{p}</p></article>)}</div><a className="button" href="/contact#quote">Request a paint assessment →</a></section>}
      {(page==="locations"||currentArea) && <>{coverage}{process}</>}
      {page==="reviews" && reviews}
      {page==="our-work" && <section className="section work-content"><div className="social-work-grid"><a href="https://www.instagram.com/camotivedetailing/" target="_blank" rel="noreferrer"><span>Instagram</span><h2>Camotive in action.</h2><p>Watch real details, transformations, and recent projects from @camotivedetailing.</p><strong>View photos & reels ↗</strong></a><a href="https://www.tiktok.com/@camotivedetailing" target="_blank" rel="noreferrer"><span>TikTok</span><h2>Every detail counts.</h2><p>See the process, the finishes, and the work behind a clean vehicle.</p><strong>Watch Camotive ↗</strong></a></div></section>}
      {page==="contact" && <section className="section contact-section" id="quote"><div><p className="eyebrow">Contact Cam</p><h2>A quote for your vehicle.</h2><p>Send your vehicle’s year, make, model, service location, and the work you have in mind. Photos help Cam assess the condition.</p><a className="contact-phone" href="tel:+12105730671">(210) 573-0671</a><a className="button" href="sms:+12105730671">Text Cam for a quote ↗</a></div><div className="contact-card"><h3>San Antonio mobile service</h3><p>Appointments at homes, workplaces, and agreed locations.</p><hr/><h3>Already scheduled?</h3><p>Have your confirmation code ready.</p><a href="/appointment">Find my appointment →</a><hr/><h3>Follow Camotive</h3><a href="https://www.instagram.com/camotivedetailing/" target="_blank" rel="noreferrer">Instagram ↗</a><a href="https://www.tiktok.com/@camotivedetailing" target="_blank" rel="noreferrer">TikTok ↗</a></div></section>}
      {page==="book" && <>      <section className="booking section" id="booking">
        <div className="section-heading booking-heading">
          <div><p className="eyebrow">Online booking</p><h2>Choose a time.<br />We&apos;ll come to you.</h2></div>
          <p>Three simple steps. Select your service, choose your preferred appointment, and tell us where the vehicle is located.</p>
        </div>
        <div className="booking-shell">
          <div className="booking-progress">
            {["Select service", "Choose date & time", "Vehicle & contact info"].map((label, index) => (
              <div className={step >= index + 1 ? "done" : ""} key={label}><span>{step > index + 1 ? "✓" : index + 1}</span><small>{label}</small></div>
            ))}
          </div>
          {step === 1 && <div className="booking-panel">
            <h3>Select your service</h3>
            <div className="choice-grid">
              {(Object.keys(packages) as PackageId[]).map((id) => (
                <button className={selectedPackage === id ? "selected" : ""} onClick={() => setSelectedPackage(id)} key={id}>
                  <span>{packages[id].name}</span><small>from ${packages[id].prices.small}</small><i>{selectedPackage === id ? "✓" : ""}</i>
                </button>
              ))}
            </div>
            <h4>Vehicle size</h4>
            <div className="size-choice-grid">
              {(["small", "medium", "large"] as VehicleSize[]).map((size) => <button key={size} className={vehicleSize === size ? "selected" : ""} onClick={() => setVehicleSize(size)}><b>{size}</b><small>{size === "small" ? "Coupe or sedan" : size === "medium" ? "Crossover, small SUV or truck" : "Full-size truck, large or 3-row SUV"}</small><span>${packages[selectedPackage].prices[size]}+</span></button>)}
            </div>
            <h4>Enhance your detail <small>Optional</small></h4>
            <div className="addon-grid">
              {(Object.keys(addOns) as AddOnId[]).map((id) => (
                <label key={id}><input type="checkbox" checked={selectedAddOns.includes(id)} onChange={() => toggleAddOn(id)} /><span>{addOns[id][0]}</span><b>+${addOns[id][1]}</b></label>
              ))}
            </div>
            <div className="booking-footer"><div><small>Estimated total</small><strong>${total}</strong></div><button className="button" onClick={() => setStep(2)}>Choose date & time →</button></div>
          </div>}
          {step === 2 && <div className="booking-panel">
            <button className="back" onClick={() => setStep(1)}>← Back</button><h3>When should we come by?</h3>
            <div className="date-layout">
              <div><p className="field-label">Select a date</p><BookingCalendar value={date} minimum={earliest} onChange={setDate} /></div>
              <div><p className="field-label">Appointment times</p><div className="time-grid">{times.map((slot) => <button key={slot} className={time === slot ? "selected" : ""} onClick={() => setTime(slot)}>{slot}</button>)}</div></div>
            </div>
            <div className="booking-footer"><div><small>Your selection</small><strong className="selection-text">{date ? formatDate(date) : "Choose a date"}{time && ` · ${time}`}</strong></div><button className="button" disabled={!date || !time} onClick={() => setStep(3)}>Add your details →</button></div>
          </div>}
          {step === 3 && <form className="booking-panel" onSubmit={submitBooking}>
            <button type="button" className="back" onClick={() => setStep(2)}>← Back</button><h3>Where are we detailing?</h3>
            <div className="form-grid">
              <label>Full name<input name="name" required placeholder="Your name" /></label>
              <label>Mobile number<input name="phone" required type="tel" placeholder="(210) 555-0123" /></label>
              <label>Email<input name="email" required type="email" placeholder="you@example.com" /></label>
              <label>Vehicle<input name="vehicle" required placeholder="Year, make & model" /></label>
              <label className="wide">Service address<input name="address" required placeholder="Street address, San Antonio, TX" /></label>
              <label className="wide">Reminder preference<select name="reminder" defaultValue="text"><option value="text">Text me 24 hours before</option><option value="email">Email me 24 hours before</option><option value="both">Text and email me</option></select></label>
            </div>
            {bookingError && <p className="form-error" role="alert">{bookingError}</p>}
            <div className="booking-footer"><div><small>{packages[selectedPackage].name} · {vehicleSize} · {formatDate(date)} at {time}</small><strong>${total}+ estimated</strong></div><button className="button" type="submit">Confirm appointment →</button></div>
          </form>}
          {step === 4 && booking && <div className="confirmation">
            <div className="checkmark">✓</div><p className="eyebrow">You&apos;re on the calendar</p><h3>Your detail is booked.</h3>
            <p>{booking.notificationStatus === "sent"
              ? "A thank-you email and text are on their way. Cam has also been notified of your new appointment."
              : "Your appointment is saved. Please call or text Camotive to confirm while messaging setup is being completed."}</p>
            <div className="confirmation-card"><div><small>Confirmation</small><strong>{booking.confirmationCode}</strong></div><div><small>When</small><strong>{formatDate(booking.date)} · {booking.time}</strong></div><div><small>Service</small><strong>{booking.packageName}</strong></div><div><small>Estimate</small><strong>${booking.total}</strong></div></div>
            <button className="outline-button" onClick={() => { setLookupCode(booking.confirmationCode); scrollTo("appointment"); }}>View my appointment</button>
          </div>}
        </div>
      </section>

</>}
      {page==="appointment" && <>      <section className="appointment section" id="appointment">
        <div><p className="eyebrow">Already booked?</p><h2>Find your appointment.</h2><p>Enter the confirmation code from your booking to see the service, date, time, and reminder preference.</p></div>
        <form onSubmit={lookupAppointment}><label>Confirmation code<input value={lookupCode} onChange={(event) => setLookupCode(event.target.value.toUpperCase())} placeholder="CAM-123456" required /></label><button className="button">View appointment →</button></form>
        {lookupError && <p className="lookup-error" role="status">{lookupError}</p>}
        {lookupResult && <div className="lookup-card"><span>✓</span><div><small>{lookupResult.package_name}</small><strong>{formatDate(lookupResult.date)} · {lookupResult.time}</strong><p>{lookupResult.vehicle} · {lookupResult.address}</p></div></div>}
      </section>

</>}
      {(isHome||["mobile-detailing","ceramic-coating","locations"].includes(page)) && <>      <section className="faq section" id="faq">
        <div className="faq-heading"><p className="eyebrow">Before we arrive</p><h2>Good to know.</h2><p>Everything you need before your mobile detail.</p></div>
        <div className="faq-list">
          <details><summary>How long does a full detail take?<span>+</span></summary><p>Most full details take approximately 3–5 hours. Timing depends on vehicle size, condition, selected add-ons, and the level of restoration needed. We&apos;ll confirm the expected timeframe before beginning.</p></details>
          <details><summary>Do you need access to water or electricity?<span>+</span></summary><p>Please have a standard outdoor water connection and electrical outlet available within reasonable reach of the vehicle. If that is not possible, contact us before booking so we can confirm what your location requires.</p></details>
          <details><summary>What is your rain policy?<span>+</span></summary><p>Light weather may not affect interior-only services, but rain or unsafe conditions can require rescheduling exterior work. Camotive will contact you as early as possible and move your appointment to the next suitable opening at no rescheduling charge.</p></details>
        </div>
      </section>

</>}
      <section className="final-cta"><h2>Ready for your next detail?</h2><p>Book your mobile service or talk to Cam about the right care for your vehicle.</p><div className="hero-actions"><a className="button" href="/book">Schedule online →</a><a className="outline-button" href="/contact#quote">Get a quote ↗</a></div></section>
      </div>
      <footer className="footer"><div className="footer-grid"><div><a className="brand" href="/"><img src="/camotive-logo-original.png" alt="Camotive Detailing"/></a><p>Premium mobile detailing, ceramic coatings, and paint enhancement in San Antonio.</p><div className="socials"><a href="https://www.instagram.com/camotivedetailing/" target="_blank" rel="noreferrer">Instagram ↗</a><a href="https://www.tiktok.com/@camotivedetailing" target="_blank" rel="noreferrer">TikTok ↗</a></div></div><div><h3>Contact</h3><a href="/locations">San Antonio, Texas</a><a href="tel:+12105730671">(210) 573-0671</a><a href="/contact">Contact Cam</a><a href="/appointment">My appointment</a></div><div><h3>Services</h3>{navLinks.map(l=><a key={l.href} href={l.href}>{l.title}</a>)}<a href="/our-work">Our Work</a><a href="/reviews">Reviews</a></div><div><h3>Google reviews</h3><a className="footer-rating" href={googleProfileUrl} target="_blank" rel="noreferrer"><span>★★★★★</span><strong>5.0 on Google</strong></a><a href="/reviews">Read customer reviews →</a></div></div><div className="footer-bottom"><p>© {new Date().getFullYear()} Camotive Detailing</p><a href="/contact">Contact</a><small>Illustrative photography: <a href="https://www.pexels.com/photo/a-person-polishing-the-car-s-body-14231701/" target="_blank" rel="noreferrer">Luke Miller</a> & <a href="https://www.pexels.com/photo/a-person-polishing-the-white-car-5233279/" target="_blank" rel="noreferrer">Khunkorn Laowisit / Pexels</a></small></div></footer>
      <a className="mobile-booking-cta" href="/book">Schedule my detail <span>→</span></a>
    </main>
  );
}
