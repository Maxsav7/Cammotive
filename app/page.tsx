"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type PackageId = "basic" | "full" | "premium";
type AddOnId = "pet" | "debris" | "carpet" | "hydro" | "headlight" | "engine";

const packages = {
  basic: {
    name: "Basic Detail",
    price: 150,
    note: "Ideal for maintenance and lightly soiled vehicles.",
    features: ["Interior surface clean", "Deep vacuum", "Hand wash + foam bath", "Wheels, tires + glass"],
  },
  full: {
    name: "Full Detail",
    price: 190,
    note: "The complete interior and exterior reset.",
    features: ["Everything in Basic", "Trim restoration", "Floor mat scrubbing", "Clay bar + hand wax"],
  },
  premium: {
    name: "Premium Detail",
    price: 260,
    note: "Maximum restoration for heavily soiled vehicles.",
    features: ["Everything in Full", "Steam-assisted clean", "Stain treatment", "Leather + interior protection"],
  },
} as const;

const addOns = {
  pet: ["Pet hair extraction", 25],
  debris: ["Fine debris + sand", 20],
  carpet: ["Hot water carpet shampoo", 40],
  hydro: ["Hydro sealant", 30],
  headlight: ["Headlight restoration", 50],
  engine: ["Engine bay clean + dress", 40],
} as const;

const fallbackReviews = [
  { author: "Marcus R.", rating: 5, text: "The attention to detail was incredible. My interior looks brand new, and they came right to my driveway.", time: "Google review" },
  { author: "Isabella T.", rating: 5, text: "Professional, punctual, and the finish on my SUV was flawless. Already booked my maintenance detail.", time: "Google review" },
  { author: "Daniel C.", rating: 5, text: "Camotive brought the depth back to my paint. The difference before and after was unreal.", time: "Google review" },
];

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
  const [selectedAddOns, setSelectedAddOns] = useState<AddOnId[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [step, setStep] = useState(1);
  const [booking, setBooking] = useState<Record<string, string> | null>(null);
  const [lookupCode, setLookupCode] = useState("");
  const [lookupResult, setLookupResult] = useState<Record<string, string> | null>(null);
  const [reviews, setReviews] = useState(fallbackReviews);
  const [bookingError, setBookingError] = useState("");

  useEffect(() => {
    fetch("/api/reviews")
      .then((response) => response.json())
      .then((data) => data.reviews?.length && setReviews(data.reviews))
      .catch(() => undefined);
  }, []);

  const total = useMemo(
    () => packages[selectedPackage].price + selectedAddOns.reduce((sum, id) => sum + addOns[id][1], 0),
    [selectedPackage, selectedAddOns],
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
      packageName: packages[selectedPackage].name,
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
          <span className="brand-mark">C</span>
          <span><b>CAMOTIVE</b><small>DETAILING</small></span>
        </button>
        <nav aria-label="Main navigation">
          {["services", "booking", "reviews", "about"].map((tab) => (
            <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => scrollTo(tab)}>
              {tab === "booking" ? "Book" : tab}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="text-button" onClick={() => scrollTo("appointment")}>My appointment</button>
          <a className="button button-small" href="tel:+12105730671">Call now</a>
        </div>
      </header>

      <section className="hero" id="home">
        <div className="hero-glow" />
        <div className="hero-copy">
          <p className="eyebrow"><span /> Premium mobile detailing · San Antonio</p>
          <h1>Clean cars<br /><em>get attention.</em></h1>
          <p className="hero-lede">High-end detailing delivered to your driveway. From daily drivers to luxury finishes, we bring back the feeling of a brand-new car.</p>
          <div className="hero-actions">
            <button className="button" onClick={() => scrollTo("booking")}>Book your detail <span>→</span></button>
            <button className="watch-link" onClick={() => scrollTo("services")}><span>▶</span> Explore services</button>
          </div>
          <div className="trust-row">
            <div><strong>5.0</strong><span className="stars">★★★★★</span><small>6 Google reviews</small></div>
            <div><strong>100%</strong><small>Mobile service</small></div>
            <div><strong>SA</strong><small>Locally owned</small></div>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="car-silhouette">
            <div className="windshield" />
            <div className="body-line" />
            <div className="headlight" />
            <div className="wheel wheel-one"><i /></div>
            <div className="wheel wheel-two"><i /></div>
          </div>
          <div className="detail-card"><span>✦</span><div><b>Mirror finish</b><small>Professional-grade products</small></div></div>
        </div>
      </section>

      <section className="services section" id="services">
        <div className="section-heading">
          <div><p className="eyebrow"><span /> Built for your vehicle</p><h2>Choose your level of detail.</h2></div>
          <p>Every service is fully mobile and completed with professional-grade products and equipment.</p>
        </div>
        <div className="package-grid">
          {(Object.keys(packages) as PackageId[]).map((id) => {
            const item = packages[id];
            return (
              <article className={`package-card ${id === "full" ? "featured" : ""}`} key={id}>
                {id === "full" && <div className="popular">Most popular</div>}
                <p className="package-number">0{Object.keys(packages).indexOf(id) + 1}</p>
                <h3>{item.name}</h3><p>{item.note}</p>
                <ul>{item.features.map((feature) => <li key={feature}>✓ <span>{feature}</span></li>)}</ul>
                <div className="price"><small>Starting at</small><strong>${item.price}</strong></div>
                <button className={id === "full" ? "button" : "outline-button"} onClick={() => { setSelectedPackage(id); scrollTo("booking"); }}>Choose {item.name.replace(" Detail", "")}</button>
              </article>
            );
          })}
        </div>
        <p className="fine-print">Final pricing is based on vehicle size and condition and is confirmed on-site before service.</p>
      </section>

      <section className="booking section" id="booking">
        <div className="section-heading booking-heading">
          <div><p className="eyebrow"><span /> Easy online scheduling</p><h2>Book the shine.</h2></div>
          <p>Pick your service, choose a time, and we&apos;ll come to you. You&apos;ll receive your confirmation and reminder details right away.</p>
        </div>
        <div className="booking-shell">
          <div className="booking-progress">
            {["Service", "Date & time", "Your details", "Confirmed"].map((label, index) => (
              <div className={step >= index + 1 ? "done" : ""} key={label}><span>{step > index + 1 ? "✓" : index + 1}</span><small>{label}</small></div>
            ))}
          </div>
          {step === 1 && <div className="booking-panel">
            <h3>Select your service</h3>
            <div className="choice-grid">
              {(Object.keys(packages) as PackageId[]).map((id) => (
                <button className={selectedPackage === id ? "selected" : ""} onClick={() => setSelectedPackage(id)} key={id}>
                  <span>{packages[id].name}</span><small>from ${packages[id].price}</small><i>{selectedPackage === id ? "✓" : ""}</i>
                </button>
              ))}
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
            <div className="booking-footer"><div><small>{packages[selectedPackage].name} · {formatDate(date)} at {time}</small><strong>${total} estimated</strong></div><button className="button" type="submit">Confirm appointment →</button></div>
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

      <section className="reviews section" id="reviews">
        <div className="section-heading"><div><p className="eyebrow"><span /> Client approved</p><h2>Five stars. Every time.</h2></div><div className="google-score"><b>G</b><span><strong>5.0</strong><i>★★★★★</i><small>6 reviews on Google</small></span></div></div>
        <div className="review-grid">{reviews.slice(0, 3).map((review, index) => <article key={`${review.author}-${index}`}><div className="quote">“</div><div className="review-stars">★★★★★</div><p>{review.text}</p><footer><span>{review.author.slice(0, 1)}</span><div><b>{review.author}</b><small>{review.time ?? "Google review"}</small></div><i>G</i></footer></article>)}</div>
        <a className="google-link" href="https://www.google.com/search?q=camotive+detailing" target="_blank" rel="noreferrer">Read all reviews on Google ↗</a>
      </section>

      <section className="appointment section" id="appointment">
        <div><p className="eyebrow"><span /> Already booked?</p><h2>Find your appointment.</h2><p>Enter the confirmation code from your booking to see the service, date, time, and reminder preference.</p></div>
        <form onSubmit={lookupAppointment}><label>Confirmation code<input value={lookupCode} onChange={(event) => setLookupCode(event.target.value.toUpperCase())} placeholder="CAM-123456" /></label><button className="button">View appointment →</button></form>
        {lookupResult && <div className="lookup-card"><span>✓</span><div><small>{lookupResult.package_name}</small><strong>{formatDate(lookupResult.date)} · {lookupResult.time}</strong><p>{lookupResult.vehicle} · {lookupResult.address}</p></div></div>}
      </section>

      <section className="about section" id="about">
        <div className="about-mark"><span>C</span></div>
        <div><p className="eyebrow"><span /> From Camotive Detailing</p><h2>Precision lives<br />in the details.</h2></div>
        <div><p>Camotive Detailing is a premium mobile detailing service based in San Antonio, Texas. We specialize in interior and exterior detailing, paint enhancement polishing, ceramic coatings, and maintenance details.</p><div className="socials"><a href="https://www.instagram.com/camotivedetailing/" target="_blank" rel="noreferrer">Instagram ↗</a><a href="https://www.tiktok.com/@camotivedetailing" target="_blank" rel="noreferrer">TikTok ↗</a><a href="tel:+12105730671">(210) 573-0671</a></div></div>
      </section>

      <footer className="footer"><div className="brand"><span className="brand-mark">C</span><span><b>CAMOTIVE</b><small>DETAILING</small></span></div><p>Premium mobile detailing in San Antonio, Texas.</p><button onClick={() => scrollTo("home")}>Back to top ↑</button></footer>
    </main>
  );
}
