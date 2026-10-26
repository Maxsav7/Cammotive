"use client";

import MeetTheOwner from "./MeetTheOwner";
import { useEffect, useRef, useState } from "react";
import WorkGallery from "./WorkGallery";
import ServiceStories from "./ServiceStories";
import MobileMenu from "./MobileMenu";
import TiltCard from "./TiltCard";
import CoatingShowcase from "./CoatingShowcase";
import Logo from "./Logo";
import BookingFlow from "./BookingFlow";
import QuoteForm from "./QuoteForm";
import ManageBooking from "./ManageBooking";
import AdminDashboard from "./AdminDashboard";
import NextOpening from "./NextOpening";
import MyAppointments from "./MyAppointments";
import { AfterYouBook, CoatingStory, CorrectionStory, DetailChooser, DetailingStories } from "./ServiceInfo";
import { googleProfileUrl } from "../lib/links";
import { depositDollars } from "../lib/booking-catalog";

type PackageId = "full" | "premium" | "maintenance" | "ceramic3" | "ceramic5";
type VehicleSize = "small" | "medium" | "large";

const packages = {
  full: { name: "Full Detail", prices: { small: 250, medium: 300, large: 350 }, note: "A complete interior and exterior reset for normally maintained vehicles. About 3–4 hours.",
    features: ["Hand wash, wheels and tires", "Vacuum seats, carpets, mats and cargo", "Interior surfaces cleaned and protected", "No added paint sealant"] },
  premium: { name: "Premium Detail", prices: { small: 350, medium: 425, large: 500 }, note: "A deeper clean with added paint protection for vehicles needing more care.",
    features: ["Everything in Full Detail", "Fabric shampoo or extraction", "Leather or Alcantara treatment", "Decontamination + 3–6 month sealant"] },
  maintenance: { name: "Maintenance Detail", prices: { small: 125, medium: 150, large: 175 }, note: "For returning clients serviced every 2–4 weeks.",
    features: ["Hand wash and wheel care", "Tire dressing", "Interior vacuum and wipe-down", "Interior and exterior glass"] },
  ceramic3: { name: "3-Year Ceramic Coating", prices: { small: 900, medium: 1050, large: 1200 }, note: "Nasiol ZR53 for gloss, easier maintenance, and up to three years of protection.",
    features: ["Prep wash + decontamination", "Panel preparation", "Nasiol ZR53 application", "Paint correction quoted separately"] },
  ceramic5: { name: "5-Year Ceramic Coating", prices: { small: 1300, medium: 1500, large: 1700 }, note: "Graphene ceramic protection with a light gloss polish for added clarity.",
    features: ["Prep wash + decontamination", "Light gloss polish", "Panel preparation", "Paint correction quoted separately"] },
} as const;

const addOns = {
  windshield: ["Windshield glass coating", 125],
  glass: ["All exterior glass coating", 225],
  headlight: ["Headlight restoration (pair)", 100],
  engine: ["Engine bay cleaning", 75],
} as const;

const quotePages = ["ceramic-coating", "paint-correction", "quote"];

export default function Site({ page = "home" }: { page?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [menu, setMenu] = useState<"services" | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [category, setCategory] = useState<"detailing" | "ceramic">(page === "ceramic-coating" ? "ceramic" : "detailing");
  const [scrolled, setScrolled] = useState(false);
  const [vehicleSize, setVehicleSize] = useState<VehicleSize>("small");
  const menuButton = useRef<HTMLButtonElement>(null);

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
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("keydown", onEscape); };
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { window.localStorage.setItem("camotive-theme", next); } catch {}
  }

  const isHome = page === "home";
  const areas = [["stone-oak", "Stone Oak"], ["alamo-heights", "Alamo Heights"], ["the-dominion", "The Dominion"], ["leon-springs", "Leon Springs"], ["downtown", "Downtown San Antonio"]];
  const currentArea = areas.find(([slug]) => slug === page);
  const titles: Record<string, [string, string]> = {
    "mobile-detailing": ["Mobile detailing, done properly.", "Hand detailing at your home or workplace, anywhere in San Antonio. Pick the detail that fits your car, then choose an open time."],
    "ceramic-coating": ["Ceramic coating. Lasting protection.", "Careful preparation and a durable ceramic layer for gloss, easier washing and protection that lasts years. Quoted after we see your paint."],
    "paint-correction": ["Bring clarity back to your paint.", "Machine polishing that reduces swirls and haze, tailored to your paint. We assess the finish before quoting."],
    locations: ["Anywhere in San Antonio.", "Camotive is fully mobile, so we come to homes, workplaces and approved locations across the city."],
    "our-work": ["See the details for yourself.", "Recent Camotive washes, interiors, finished vehicles and ceramic coatings."],
    reviews: ["What our customers say.", "Rated 5.0 on Google. Read what our customers say about their detail."],
    about: ["About us.", "Camotive is a mobile detailing business in San Antonio, owned and run by Camron Freeman."],
    contact: ["Let's talk about your vehicle.", "Questions about a service, your location or your paint? Call or text us directly."],
    book: ["Book your detail.", `Choose your detail and add-ons, pick an open time, and pay a $${depositDollars} deposit to confirm it.`],
    quote: ["Request a quote.", "Ceramic coating and paint correction are quoted after we understand your vehicle. Tell us about it and we'll reply within one business day."],
    appointment: ["My appointments.", "See every detail you've booked with us, or cancel an upcoming one. We'll email you a code to sign in."],
  };
  const title = currentArea ? [`Mobile detailing in ${currentArea[1]}.`, "Professional interior and exterior care at your home or workplace, plus ceramic protection and paint correction by quote."] : titles[page];
  // Breadcrumb trail after "Home": the current page, or Service area > neighborhood.
  const pageNames: Record<string, string> = {
    "mobile-detailing": "Detailing", "ceramic-coating": "Ceramic Coating", "paint-correction": "Paint Correction",
    locations: "Service area", "our-work": "Our Work", reviews: "Reviews", contact: "Contact", about: "About Us",
    book: "Book a detail", quote: "Request a quote", appointment: "My appointments",
  };
  const crumbs: [string, string?][] = currentArea ? [["Service area", "/locations"], [currentArea[1]]] : [[pageNames[page] ?? ""]];
  const navLinks = [
    { href: "/mobile-detailing", title: "Detailing", sub: "Book online, we come to you" },
    { href: "/ceramic-coating", title: "Ceramic Coating", sub: "Long-term protection, by quote" },
    { href: "/paint-correction", title: "Paint Correction", sub: "Remove swirls and haze, by quote" },
  ];
  const heroImage: Record<string, [string, string]> = {
    "mobile-detailing": ["/work/lamborghini-foam.jpg", "Lamborghini during a foam wash"],
    "paint-correction": ["/work/tundra-finish.jpg", "Reflections along a silver Toyota Tundra"],
  };

  const pricing = <section className="section pricing-section" id="pricing">
    <div className="section-heading"><p className="eyebrow">Pricing</p><h2>Clear prices, before you book.</h2><p>Choose your vehicle size to see starting prices. We confirm the final price before work begins.</p></div>
    <div className="pricing-notice">Mobile service anywhere in San Antonio. A ${depositDollars} deposit, paid when you book, confirms your time and goes toward your total. <a href="/book">Book a detail</a></div>
    <div className="pricing-step"><span>1</span><div><h3>Choose a service</h3><p>Detailing is booked online. Coatings are quoted first.</p></div></div>
    <div className="category-tabs" role="tablist" aria-label="Service category">
      <button id="detail-tab" role="tab" aria-selected={category === "detailing"} aria-controls="packages-panel" tabIndex={category === "detailing" ? 0 : -1} onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setCategory("ceramic"); document.getElementById("ceramic-tab")?.focus(); } }} className={category === "detailing" ? "selected" : ""} onClick={() => setCategory("detailing")}><strong>Detailing</strong><small>Book online</small></button>
      <button id="ceramic-tab" role="tab" aria-selected={category === "ceramic"} aria-controls="packages-panel" tabIndex={category === "ceramic" ? 0 : -1} onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setCategory("detailing"); document.getElementById("detail-tab")?.focus(); } }} className={category === "ceramic" ? "selected" : ""} onClick={() => setCategory("ceramic")}><strong>Ceramic Coating</strong><small>By quote</small></button>
    </div>
    <div className="pricing-step"><span>2</span><div><h3>Compare packages</h3><p>Starting prices for your vehicle size.</p></div><label className="price-size">Vehicle size<select value={vehicleSize} onChange={e => setVehicleSize(e.target.value as VehicleSize)}><option value="small">Small: coupe or sedan</option><option value="medium">Medium: crossover or small truck</option><option value="large">Large: SUV or full-size truck</option></select></label></div>
    <div id="packages-panel" role="tabpanel" aria-labelledby={category === "detailing" ? "detail-tab" : "ceramic-tab"} className={`price-grid ${category === "ceramic" ? "two" : ""}`}>
      {(category === "detailing" ? ["full", "premium", "maintenance"] : ["ceramic3", "ceramic5"]).map(key => {
        const id = key as PackageId; const item = packages[id]; const quoted = id.startsWith("ceramic");
        return <TiltCard className={`price-card ${id === "premium" ? "highlight" : ""}`} key={id}>{id === "premium" && <span className="popular">Deep clean + protection</span>}<h3>{item.name}</h3><p>{item.note}</p>
          <div className="price"><small>From</small><strong>${item.prices[vehicleSize]}</strong></div><ul>{item.features.map(f => <li key={f}><span>✓</span>{f}</li>)}</ul>
          {quoted ? <a className="button" href="/quote?service=ceramic">Request a quote</a> : <a className="button" href={`/book?service=${id}&size=${vehicleSize}`}>Book this detail</a>}
          <a className="price-phone" href="tel:+12105730671">(210) 573-0671</a></TiltCard>;
      })}
    </div>
    <div className="pricing-step"><span>3</span><div><h3>Add what you need</h3><p>Optional upgrades, chosen while booking.</p></div></div>
    <div className="add-on-catalog">{Object.entries(addOns).map(([id, [name, price]]) => <a key={id} href={`/book?addon=${id}`}><span>{name}</span><strong>${price}</strong></a>)}</div>
    <p className="menu-notes">Excessive pet hair or sand removal starts at $50. Severe stains, smoke, urine, mildew and unusually neglected vehicles are quoted separately.</p>
  </section>;

  const faq = <section className="faq section" id="faq">
    <div className="faq-heading"><p className="eyebrow">Before we arrive</p><h2>Good to know.</h2><p>Everything you need before your mobile detail.</p></div>
    <div className="faq-list">
      <details><summary>How does online booking work?<span>+</span></summary><p>Choose your detail and any add-ons, pick an open time, and pay the ${depositDollars} deposit on a secure Stripe checkout. That confirms your booking right away: the confirmation email has a calendar invite, and you&apos;ll get a reminder the day before. To see your bookings or cancel one, go to My appointments and we&apos;ll email you a sign-in code.</p></details>
      <details><summary>Is there a deposit?<span>+</span></summary><p>Yes. A ${depositDollars} deposit is paid online when you book, which confirms your time. It goes toward your total, and the rest is paid when the detail is done. If you cancel, the deposit is non-refundable. If we ever have to cancel, we refund it in full.</p></details>
      <details><summary>How long does a Full Detail take?<span>+</span></summary><p>About 3–4 hours. Larger vehicles, add-ons and heavier soiling can take longer; we'll tell you before starting.</p></details>
      <details><summary>Do you need water or electricity?<span>+</span></summary><p>Please have an outdoor water connection and a power outlet within reach of the vehicle. If that isn&apos;t possible, call or text before booking so we can confirm what your location needs.</p></details>
      <details><summary>Can you detail at my apartment or office?<span>+</span></summary><p>Yes, as long as we can access the spot and the property allows it. Please arrange gate codes and any HOA, apartment or building permission in advance.</p></details>
      <details><summary>What if it rains?<span>+</span></summary><p>Interior-only work can often go ahead. If rain or unsafe weather affects exterior work, we contact you as early as possible and move your appointment to the next suitable opening at no charge.</p></details>
    </div>
  </section>;

  const quoteCta = quotePages.includes(page);
  return (
    <main className={`site-shell ${isHome ? "home-page" : "inner-page"}`} data-theme={theme}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="header-wrap">
        <header className={`site-header ${scrolled || !isHome || mobileMenu ? "solid" : ""}`}>
          <a className="brand" href="/" aria-label="Camotive Detailing home"><Logo /></a>
          <nav className="desktop-nav" aria-label="Main navigation">
            <a href="/" aria-current={isHome ? "page" : undefined}>Home</a>
            <div className="nav-dropdown" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setMenu(null); }}>
              <button aria-expanded={menu === "services"} aria-controls="service-menu" onClick={() => setMenu(menu === "services" ? null : "services")}>Services <span>⌄</span></button>
              {menu === "services" && <div className="dropdown-panel" id="service-menu">{navLinks.map(l => <a key={l.href} href={l.href}><strong>{l.title}</strong><small>{l.sub}</small></a>)}</div>}
            </div>
            <a href="/our-work" aria-current={page === "our-work" ? "page" : undefined}>Our Work</a>
            <a href={googleProfileUrl} target="_blank" rel="noopener noreferrer">Reviews<span className="sr-only"> on Google (opens in a new tab)</span></a>
            <a href="/contact" aria-current={page === "contact" ? "page" : undefined}>Contact</a>
            <a href="/about" aria-current={page === "about" ? "page" : undefined}>About Us</a>
          </nav>
          <div className="header-actions"><button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? "☼" : "☾"}</button><a className="header-phone" href="tel:+12105730671">(210) 573-0671</a><a className="button button-small" href="/book">Book a detail</a><button ref={menuButton} className="mobile-toggle" aria-expanded={mobileMenu} aria-controls="mobile-nav" aria-label={mobileMenu ? "Close navigation" : "Open navigation"} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? "✕" : "☰"}</button></div>
        </header>
        <MobileMenu open={mobileMenu} onClose={() => setMobileMenu(false)} triggerRef={menuButton} page={page} groups={[
          { id: "services", label: "Services", links: [...navLinks.map(l => ({ href: l.href, label: l.title })), { href: "/locations", label: "Service area" }] },
        ]} />
      </div>
      <div id="main-content">
        {isHome ? <>
          <section className="hero" id="home"><img className="hero-photo" src="/work/mclaren-hero.jpg" alt="Black McLaren with its door raised, detailed by Camotive" fetchPriority="high" /><div className="hero-shade" />
            <div className="hero-copy"><p className="hero-location">We come to you, anywhere in San Antonio</p><h1>Mobile car detailing in San Antonio</h1>
              <p className="hero-lede">Hand detailing at your home or workplace. Pick an open time online and it&apos;s booked instantly.</p>
              <div className="hero-actions"><a className="button" href="/book">Book a detail</a><NextOpening /></div>
              <p className="hero-quote">Ceramic coating or paint correction? <a href="/quote">Request a quote</a></p>
              <a className="hero-rating" href={googleProfileUrl} target="_blank" rel="noopener noreferrer" aria-label="Rated 5.0 out of 5 — view Camotive on Google (opens in a new tab)"><b className="google-g" aria-hidden="true">G</b><strong>5.0</strong><span aria-hidden="true">★★★★★</span><small>Google reviews</small></a></div></section>
          <ServiceStories />
          <section className="section convenience"><div className="section-heading"><p className="eyebrow">We come to you</p><h2>Your schedule. Your location.</h2><p>Detailing that works around your day, anywhere in San Antonio.</p></div><div className="convenience-grid">{[["Home", "Get a detail without leaving your driveway."], ["Workplace", "We work on your car while you work."], ["Apartment", "Arrange access and property permission in advance."], ["Somewhere else", "Tell us where the car is and we'll confirm the spot works."]].map(([name, desc]) => <a href="/book" key={name}><div><h3>{name}</h3><p>{desc}</p></div></a>)}</div></section>
          {pricing}
          <AfterYouBook />
        </> : page === "manage" || page === "admin" ? null : <section className="inner-hero"><div className="inner-hero-copy"><nav className="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li>{crumbs.map(([label, href]) => <li key={label}>{href ? <a href={href}>{label}</a> : <span aria-current="page">{label}</span>}</li>)}</ol></nav><h1>{title?.[0]}</h1><p>{title?.[1]}</p>
          {!["book", "appointment", "quote"].includes(page) && <div className="hero-actions">{page === "reviews" ? <><a className="button" href={googleProfileUrl} target="_blank" rel="noopener noreferrer" aria-label="Read our Google reviews (opens in a new tab)">Read our Google reviews</a><a className="outline-button" href="/book">Book a detail</a></>
            : <>{quoteCta ? <a className="button" href={`/quote?service=${page === "paint-correction" ? "correction" : "ceramic"}`}>Request a quote</a> : <a className="button" href="/book">Book a detail</a>}<a className="outline-button" href="tel:+12105730671">Call (210) 573-0671</a></>}</div>}</div>
          {heroImage[page] && <img src={heroImage[page][0]} alt={heroImage[page][1]} />}</section>}

        {page === "mobile-detailing" && <><DetailingStories /><DetailChooser />{pricing}<AfterYouBook /></>}
        {page === "ceramic-coating" && <><CoatingShowcase /><CoatingStory />{pricing}</>}
        {page === "paint-correction" && <CorrectionStory />}
        {(page === "locations" || currentArea) && <section className="section coverage" id="coverage"><div className="section-heading"><p className="eyebrow">Service area</p><h2>Wherever the car is parked.</h2><p>Camotive is fully mobile and serves all of San Antonio, including these neighborhoods.</p></div><div className="location-grid">{areas.map(([slug, name]) => <TiltCard as="a" href={`/${slug}`} key={slug}><h3>{name}</h3><p>Mobile detailing at your home or workplace</p><span className="area-link">About this area</span></TiltCard>)}</div><p className="coverage-note">Somewhere else in San Antonio? We come to you there too. <a href="/book">Book a detail</a></p></section>}
        {(page === "locations" || currentArea) && <AfterYouBook />}
        {page === "reviews" && <section className="section compact-reviews" id="reviews" aria-label="Google reviews"><a className="compact-rating" href={googleProfileUrl} target="_blank" rel="noopener noreferrer" aria-label="Rated 5.0 out of 5 — view Camotive on Google (opens in a new tab)"><b className="google-g" aria-hidden="true">G</b><strong>5.0</strong><span aria-hidden="true">★★★★★</span><small>on Google</small></a><div className="compact-review-links"><a href={googleProfileUrl} target="_blank" rel="noopener noreferrer">Read the reviews on Google</a></div></section>}
        {page === "our-work" && <WorkGallery />}
        {page === "about" && <MeetTheOwner />}
        {page === "contact" && <section className="section contact-section" id="quote"><div><p className="eyebrow">Contact us</p><h2>Call, text or send a request.</h2><p>For detailing, the quickest way is to book an open time online. For ceramic coating or paint correction, send a quote request or text us a few photos.</p><a className="contact-phone" href="tel:+12105730671">(210) 573-0671</a><div className="hero-actions"><a className="button" href="/book">Book a detail</a><a className="outline-button" href="/quote">Request a quote</a></div></div><div className="contact-card"><h3>Anywhere in San Antonio</h3><p>Homes, workplaces and approved locations.</p><hr /><h3>Already booked?</h3><p>Open the link in your email, or request a new one.</p><a href="/appointment">Find my appointment</a><hr /><h3>Follow Camotive</h3><a href="https://www.instagram.com/camotivedetailing/" target="_blank" rel="noreferrer">Instagram</a><a href="https://www.tiktok.com/@camotivedetailing" target="_blank" rel="noreferrer">TikTok</a></div></section>}
        {page === "book" && <section className="booking section" id="booking"><BookingFlow /></section>}
        {page === "quote" && <section className="section quote-section"><QuoteForm /></section>}
        {page === "manage" && <ManageBooking />}
        {page === "admin" && <AdminDashboard />}
        {page === "appointment" && <MyAppointments />}
        {(isHome || ["mobile-detailing", "locations"].includes(page) || currentArea) && faq}
        {page !== "manage" && page !== "admin" && <section className="final-cta">{/* The CLA also appears in the gallery and coating showcase; don't show it twice. */}{!["our-work", "ceramic-coating"].includes(page) && <img src="/work/mercedes-cla-rear.jpg" alt="" loading="lazy" decoding="async" />}
          {quoteCta && page !== "quote" ? <><h2>Ready for a quote?</h2><p>Tell us about your vehicle and what you&apos;d like. We reply within one business day.</p><div className="hero-actions"><a className="button" href={`/quote?service=${page === "paint-correction" ? "correction" : "ceramic"}`}>Request a quote</a><a className="outline-button" href="sms:+12105730671">Text us photos</a></div></>
            : <><h2>Ready for your next detail?</h2><p>Pick an open time online and it&apos;s booked instantly. Prefer to talk first? Call or text anytime.</p><div className="hero-actions"><a className="button" href="/book">Book a detail</a><a className="outline-button" href="tel:+12105730671">Call (210) 573-0671</a></div></>}
        </section>}
      </div>
      <footer className="footer"><div className="footer-grid"><div><a className="brand" href="/" aria-label="Camotive Detailing home"><Logo /></a><p>Mobile car detailing anywhere in San Antonio, plus ceramic coating and paint correction by quote.</p><div className="socials"><a href="https://www.instagram.com/camotivedetailing/" target="_blank" rel="noreferrer">Instagram</a><a href="https://www.tiktok.com/@camotivedetailing" target="_blank" rel="noreferrer">TikTok</a></div></div>
        <div><h3>Book</h3><a href="/book">Book a detail</a><a href="/quote">Request a quote</a><a href="/appointment">My appointment</a><a href="tel:+12105730671">(210) 573-0671</a></div>
        <div><h3>Services</h3>{navLinks.map(l => <a key={l.href} href={l.href}>{l.title}</a>)}<a href="/locations">Service area</a></div>
        <div><h3>Camotive</h3><a href="/our-work">Our Work</a><a href={googleProfileUrl} target="_blank" rel="noopener noreferrer">Reviews<span className="sr-only"> on Google (opens in a new tab)</span></a><a href="/contact">Contact</a><a href="/about">About Us</a><a className="footer-rating" href={googleProfileUrl} target="_blank" rel="noreferrer"><span>★★★★★</span><strong>5.0 on Google</strong></a></div></div>
        <div className="footer-bottom"><p>© {new Date().getFullYear()} Camotive Detailing</p><small>Photos and videos by Camotive Detailing</small></div></footer>
      {!["book", "manage", "admin"].includes(page) && <a className="mobile-booking-cta" href={quoteCta ? "/quote" : "/book"}>{quoteCta ? "Request a quote" : "Book a detail"}</a>}
    </main>
  );
}
