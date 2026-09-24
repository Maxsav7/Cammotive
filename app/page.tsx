"use client";

import Script from "next/script";
import { FormEvent, useMemo, useState } from "react";

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

export default function Home() {
  const [activeTab, setActiveTab] = useState("services");
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
    setActiveTab(id);
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
  }

  return (
    <main>
      <header className="site-header">
        <button className="brand" onClick={() => scrollTo("home")} aria-label="Camotive home">
          <img src="/camotive-logo-original.png" alt="Camotive Detailing" />
        </button>
        <nav aria-label="Main navigation">
          {["services", "coverage", "reviews", "faq"].map((tab) => (
            <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => scrollTo(tab)}>
              {tab === "booking" ? "Book" : tab}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="text-button" onClick={() => scrollTo("appointment")}>My appointment</button>
          <button className="button button-small" onClick={() => scrollTo("booking")}>Book now</button>
        </div>
      </header>

      <section className="hero" id="home">
        <div className="hero-glow" />
        <div className="hero-copy">
          <p className="eyebrow"><span /> We come to you · San Antonio</p>
          <h1>Protect your paint.<br /><em>Save your time.</em></h1>
          <p className="hero-lede">Professional mobile detailing at your home or workplace. We restore gloss, protect your finish, and save you the drive across town.</p>
          <div className="hero-actions">
            <button className="button hero-primary" onClick={() => scrollTo("booking")}>Schedule My Detail <span>→</span></button>
            <button className="coverage-button" onClick={() => scrollTo("coverage")}>View Mobile Coverage Area</button>
          </div>
          <div className="trust-row">
            <div><strong>{reviewSummary.rating?.toFixed(1) ?? "Google"}</strong>{reviewSummary.rating && <span className="stars">★★★★★</span>}<small>{reviewSummary.count ? `${reviewSummary.count} Google reviews` : "Live review connection"}</small></div>
            <div><strong>100%</strong><small>Mobile service</small></div>
            <div><strong>SA</strong><small>Locally owned</small></div>
          </div>
        </div>
        <div className="hero-visual brand-hero" aria-label="Camotive Detailing — Driven by Detail">
          <div className="hero-brand-mark"><img src="/camotive-logo-original.png" alt="Camotive Detailing original logo" /><p>Driven by detail</p></div>
          <div className="detail-card"><span>✦</span><div><b>Professional paint care</b><small>Detailed at your home or workplace</small></div></div>
        </div>
      </section>

      <section className="confidence-strip" aria-label="Why choose Camotive">
        <div><span>01</span><p><strong>We come to you</strong><small>Home or workplace appointments</small></p></div>
        <div><span>02</span><p><strong>Upfront estimates</strong><small>Clear packages and add-ons</small></p></div>
        <div><span>03</span><p><strong>Paint-safe process</strong><small>Professional products and care</small></p></div>
      </section>

      <section className="services section" id="services">
        <div className="section-heading">
          <div><p className="eyebrow"><span /> Built for your vehicle</p><h2>Choose your level of detail.</h2></div>
          <p>Every service is fully mobile and completed with professional-grade products and equipment.</p>
        </div>
        <div className="package-grid package-grid-menu">
          {(Object.keys(packages) as PackageId[]).map((id) => {
            const item = packages[id];
            return (
              <article className={`package-card ${id === "premium" ? "featured" : ""}`} key={id}>
                {id === "premium" && <div className="popular">Most popular</div>}
                <p className="package-number">0{Object.keys(packages).indexOf(id) + 1}</p>
                <h3>{item.name}</h3><p>{item.note}</p>
                <ul>{item.features.map((feature) => <li key={feature}>✓ <span>{feature}</span></li>)}</ul>
                <div className="size-prices"><span>Small <b>${item.prices.small}+</b></span><span>Medium <b>${item.prices.medium}+</b></span><span>Large <b>${item.prices.large}+</b></span></div>
                <button className={id === "premium" ? "button" : "outline-button"} onClick={() => { setSelectedPackage(id); scrollTo("booking"); }}>Choose {item.name.replace(" Detail", "")}</button>
              </article>
            );
          })}
        </div>
        <div className="menu-notes"><p><b>Vehicle sizes:</b> Small — coupe or sedan · Medium — crossover, small SUV, or small truck · Large — full-size truck, large SUV, or 3-row SUV.</p><p>Excessive pet hair or sand removal starts at +$50. Severe stains, smoke, urine, mildew, paint correction, and unusually neglected vehicles require a separate quote. Final pricing is confirmed before service.</p></div>
      </section>

      <section className="booking section" id="booking">
        <div className="section-heading booking-heading">
          <div><p className="eyebrow"><span /> Easy online scheduling</p><h2>Book the shine.</h2></div>
          <p>Pick your service, choose a time, and we&apos;ll come to you. You&apos;ll receive your confirmation and reminder details right away.</p>
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
              <label className="date-field">Select a date<input type="date" min={earliest} value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <div><p className="field-label">Available times</p><div className="time-grid">{times.map((slot) => <button key={slot} className={time === slot ? "selected" : ""} onClick={() => setTime(slot)}>{slot}</button>)}</div></div>
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

      <section className="coverage section" id="coverage">
        <div className="coverage-copy">
          <p className="eyebrow"><span /> San Antonio mobile service</p>
          <h2>Professional detailing,<br />wherever you park.</h2>
          <p>Camotive brings professional-grade products, equipment, and paint protection directly to homes and workplaces throughout the San Antonio area.</p>
          <div className="location-facts">
            <div><small>Service base</small><strong>San Antonio, Texas</strong><span>Mobile service · No public storefront</span></div>
            <div><small>Availability</small><strong>Appointments from 8 AM</strong><span>Residential and workplace service</span></div>
          </div>
          <button className="button" onClick={() => scrollTo("booking")}>Check availability →</button>
        </div>
        <div className="coverage-map" aria-label="Stylized map of Camotive's San Antonio service area">
          <div className="map-road road-one" /><div className="map-road road-two" /><div className="map-road road-three" />
          {[["Stone Oak", "north"], ["The Dominion", "northwest"], ["Leon Springs", "west"], ["Alamo Heights", "central"], ["Downtown", "downtown"]].map(([name, position]) => <div className={`map-pin ${position}`} key={name}><i /><span>{name}</span></div>)}
          <div className="coverage-radius"><b>CAMOTIVE</b><small>Mobile coverage</small></div>
        </div>
        <div className="neighborhood-list">
          <p>Popular service areas</p>
          {["Stone Oak", "Alamo Heights", "The Dominion", "Leon Springs", "Downtown San Antonio"].map((area, index) => <div key={area}><span>0{index + 1}</span><strong>{area}</strong><i>Mobile service</i></div>)}
          <p className="coverage-note">Outside these areas? Contact us—we may still be able to come to you.</p>
        </div>
      </section>

      <section className="reviews section" id="reviews">
        <Script src="https://elfsightcdn.com/platform.js" strategy="lazyOnload" />
        <div className="section-heading"><div><p className="eyebrow"><span /> Verified on Google</p><h2>What customers say.</h2></div><div className="google-score"><b>G</b><span><strong>{reviewSummary.rating?.toFixed(1) ?? "Google"}</strong>{reviewSummary.rating && <i>★★★★★</i>}<small>{reviewSummary.count ? `${reviewSummary.count} reviews on Google` : "Camotive Detailing profile"}</small></span></div></div>
        <div className="elfsight-review-shell">
          <div className="elfsight-app-1a419f21-0cfe-481d-972c-8b2baeacf0dc" data-elfsight-app-lazy />
        </div>
        <a className="google-link" href={reviewSummary.profileUrl} target="_blank" rel="noreferrer">Read all reviews on Google ↗</a>
      </section>

      <section className="faq section" id="faq">
        <div className="faq-heading"><p className="eyebrow"><span /> Before we arrive</p><h2>Common questions.</h2><p>Everything you need to know before your mobile detail.</p></div>
        <div className="faq-list">
          <details><summary>How long does a full detail take?<span>+</span></summary><p>Most full details take approximately 3–5 hours. Timing depends on vehicle size, condition, selected add-ons, and the level of restoration needed. We&apos;ll confirm the expected timeframe before beginning.</p></details>
          <details><summary>Do you need access to water or electricity?<span>+</span></summary><p>Please have a standard outdoor water connection and electrical outlet available within reasonable reach of the vehicle. If that is not possible, contact us before booking so we can confirm what your location requires.</p></details>
          <details><summary>What is your rain policy?<span>+</span></summary><p>Light weather may not affect interior-only services, but rain or unsafe conditions can require rescheduling exterior work. Camotive will contact you as early as possible and move your appointment to the next suitable opening at no rescheduling charge.</p></details>
        </div>
      </section>

      <section className="appointment section" id="appointment">
        <div><p className="eyebrow"><span /> Already booked?</p><h2>Find your appointment.</h2><p>Enter the confirmation code from your booking to see the service, date, time, and reminder preference.</p></div>
        <form onSubmit={lookupAppointment}><label>Confirmation code<input value={lookupCode} onChange={(event) => setLookupCode(event.target.value.toUpperCase())} placeholder="CAM-123456" /></label><button className="button">View appointment →</button></form>
        {lookupResult && <div className="lookup-card"><span>✓</span><div><small>{lookupResult.package_name}</small><strong>{formatDate(lookupResult.date)} · {lookupResult.time}</strong><p>{lookupResult.vehicle} · {lookupResult.address}</p></div></div>}
      </section>

      <section className="about section" id="about">
        <div className="about-mark"><img src="/camotive-logo-original.png" alt="Camotive Detailing original logo" /></div>
        <div><p className="eyebrow"><span /> From Camotive Detailing</p><h2>Precision lives<br />in the details.</h2></div>
        <div><p>Camotive Detailing is a premium mobile detailing service based in San Antonio, Texas. We specialize in interior and exterior detailing, paint enhancement polishing, ceramic coatings, and maintenance details.</p><div className="socials"><a href="https://www.instagram.com/camotivedetailing/" target="_blank" rel="noreferrer">Instagram ↗</a><a href="https://www.tiktok.com/@camotivedetailing" target="_blank" rel="noreferrer">TikTok ↗</a><a href="tel:+12105730671">(210) 573-0671</a></div></div>
      </section>

      <footer className="footer"><div className="brand"><img src="/camotive-logo-original.png" alt="Camotive Detailing" /></div><p>Premium mobile detailing in San Antonio, Texas.</p><button onClick={() => scrollTo("home")}>Back to top ↑</button></footer>
      <button className="mobile-booking-cta" onClick={() => scrollTo("booking")}>Schedule My Detail <span>→</span></button>
    </main>
  );
}
