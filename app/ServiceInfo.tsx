"use client";
// Service stories: what each service is, what it fixes, what it won't, how long it
// takes and how to look after the result. Plus the chooser and the booking timeline.
import { useState } from "react";
import { depositDollars } from "../lib/booking-catalog";

type Fact = [label: string, text: string];
function Story({ id, eyebrow, title, intro, photo, alt, facts, action, reverse = false }: {
  id: string; eyebrow: string; title: string; intro: string; photo: string; alt: string; facts: Fact[]; action: React.ReactNode; reverse?: boolean;
}) {
  return <article id={id} className={`service-story ${reverse ? "reverse" : ""}`} aria-labelledby={`${id}-title`}>
    <div className="service-story-media"><img src={`/work/${photo}.jpg`} alt={alt} width={1200} height={1600} loading="lazy" decoding="async" /></div>
    <div className="service-story-copy">
      <p className="eyebrow">{eyebrow}</p>
      <h3 id={`${id}-title`}>{title}</h3>
      <p className="service-story-intro">{intro}</p>
      <dl className="fact-list">{facts.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl>
      {action}
    </div>
  </article>;
}

export function DetailingStories() {
  return <section className="section service-stories" aria-labelledby="detailing-stories-heading">
    <div className="section-heading"><p className="eyebrow">Choose your detail</p><h2 id="detailing-stories-heading">Three details, one standard.</h2><p>Every detail is done by hand at your home or workplace. Here&apos;s what each one covers, and what it doesn&apos;t, so you can book the right one.</p></div>
    <Story id="full-detail" eyebrow="Most booked" title="Full Detail" photo="mclaren-front" alt="Black McLaren after a full exterior detail"
      intro="A complete interior and exterior reset for a car that's been looked after but needs a proper clean."
      facts={[
        ["What's included", "Hand wash, wheels and tires; seats, carpets, mats and cargo vacuumed; interior surfaces cleaned and protected."],
        ["Best for", "Regular drivers that haven't had a professional detail in a while."],
        ["Time", "About 3–4 hours at your location."],
        ["What it won't fix", "Swirl marks, scratches, rock chips or set-in stains. Those need paint correction or a deeper clean."],
        ["Afterwards", "A Maintenance Detail every 2–4 weeks keeps it this way."],
      ]}
      action={<a className="button" href="/book?service=full">Book a Full Detail</a>} />
    <Story id="premium-detail" eyebrow="Deep clean and protection" title="Premium Detail" photo="tundra-cabin" alt="Toyota Tundra cabin after a deep interior clean" reverse
      intro="Everything in the Full Detail, plus the deeper work a car needs when it's been carrying real life."
      facts={[
        ["What's added", "Fabric shampoo or extraction, leather or Alcantara treatment, paint decontamination and a 3–6 month sealant."],
        ["Best for", "Family cars, work trucks, pet hair, spills, or getting a car ready to sell."],
        ["Time", "A longer visit than the Full Detail. Allow most of your morning or afternoon slot."],
        ["What it won't fix", "Paint defects and permanent damage to fabric or leather. We'll tell you honestly what's possible."],
        ["Afterwards", "The sealant adds gloss and makes washing easier for a few months."],
      ]}
      action={<a className="button" href="/book?service=premium">Book a Premium Detail</a>} />
    <Story id="maintenance-detail" eyebrow="For returning clients" title="Maintenance Detail" photo="bmw-foam" alt="BMW covered in wash foam during a maintenance detail"
      intro="A lighter, regular visit that keeps a detailed car looking freshly detailed."
      facts={[
        ["What's included", "Hand wash and wheel care, tire dressing, interior vacuum and wipe-down, interior and exterior glass."],
        ["Best for", "Returning clients on a 2–4 week schedule."],
        ["Time", "A shorter visit than the Full Detail."],
        ["What it won't fix", "Built-up grime from months without care. Start with a Full or Premium Detail."],
      ]}
      action={<a className="button" href="/book?service=maintenance">Book a Maintenance Detail</a>} />
  </section>;
}

const questions = [
  { id: "last", label: "When was it last professionally detailed?", options: [["recent", "Within the last month"], ["while", "A few months ago"], ["never", "Never, or I can't remember"]] },
  { id: "worry", label: "What bothers you most?", options: [["dirt", "General dirt inside and out"], ["mess", "Stains, spills or pet hair"], ["paint", "Dull paint, swirls or scratches"]] },
  { id: "protect", label: "Do you want long-term paint protection?", options: [["no", "Not right now"], ["yes", "Yes, for years"]] },
] as const;

export function DetailChooser() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete = questions.every(q => answers[q.id]);
  let result: { title: string; why: string; href: string; cta: string } | null = null;
  if (complete) {
    if (answers.worry === "paint") result = { title: "Paint correction", why: "Swirls and scratches are in the paint itself, so washing won't remove them. We assess the finish and quote the right level of polishing.", href: "/quote?service=correction", cta: "Request a paint assessment" };
    else if (answers.protect === "yes") result = { title: "Ceramic coating", why: "For protection that lasts years, a coating is the right step. We quote it after seeing the paint, since preparation depends on its condition.", href: "/quote?service=ceramic", cta: "Request a coating quote" };
    else if (answers.worry === "mess" || answers.last === "never") result = { title: "Premium Detail", why: "Stains, spills and pet hair need extraction and deeper interior work than a standard clean.", href: "/book?service=premium", cta: "Book a Premium Detail" };
    else if (answers.last === "recent") result = { title: "Maintenance Detail", why: "Your car was detailed recently, so a maintenance visit is enough to bring it back.", href: "/book?service=maintenance", cta: "Book a Maintenance Detail" };
    else result = { title: "Full Detail", why: "A complete interior and exterior reset is the right starting point.", href: "/book?service=full", cta: "Book a Full Detail" };
  }
  return <section className="section chooser" aria-labelledby="chooser-heading">
    <div className="section-heading"><p className="eyebrow">Not sure which to book?</p><h2 id="chooser-heading">Which detail do I need?</h2><p>Three quick questions.</p></div>
    <div className="chooser-grid">
      <div className="chooser-questions">{questions.map(q => <fieldset key={q.id}><legend>{q.label}</legend><div>
        {q.options.map(([value, text]) => <label key={value} className={answers[q.id] === value ? "selected" : ""}><input type="radio" name={q.id} value={value} checked={answers[q.id] === value} onChange={() => setAnswers({ ...answers, [q.id]: value })} />{text}</label>)}
      </div></fieldset>)}</div>
      <div className="chooser-result" aria-live="polite">
        {result ? <><p className="eyebrow">We&apos;d recommend</p><h3>{result.title}</h3><p>{result.why}</p><a className="button" href={result.href}>{result.cta}</a></>
          : <><p className="eyebrow">Your recommendation</p><p className="chooser-empty">Answer the questions and we&apos;ll point you to the right service.</p></>}
      </div>
    </div>
  </section>;
}

export function AfterYouBook() {
  return <section className="section after-you-book" aria-labelledby="after-heading">
    <div className="section-heading"><p className="eyebrow">How booking works</p><h2 id="after-heading">What happens when you book.</h2><p>Pick an open time and a ${depositDollars} deposit confirms it. The rest is paid when the detail is done.</p></div>
    <ol className="timeline">
      <li><span>1</span><h3>Choose</h3><p>Pick your detail, any add-ons, and an open time. Only times we can actually make are shown.</p></li>
      <li><span>2</span><h3>Pay the deposit</h3><p>A ${depositDollars} deposit on Stripe&apos;s secure checkout confirms your booking. It goes toward your total.</p></li>
      <li><span>3</span><h3>Confirmation</h3><p>Your confirmation email arrives right away, with a calendar invite. A reminder follows the day before.</p></li>
      <li><span>4</span><h3>Your detail</h3><p>We arrive at your slot. Need to cancel? Do it from My appointments; the deposit is non-refundable.</p></li>
    </ol>
    <a className="button" href="/book">Book a detail</a>
  </section>;
}

export function CoatingStory() {
  return <section className="section long-story" aria-labelledby="coating-story-heading">
    <div className="section-heading"><p className="eyebrow">Understanding ceramic coating</p><h2 id="coating-story-heading">What a coating does, and what it doesn&apos;t.</h2></div>
    <div className="story-columns">
      <div><h3>What it is</h3><p>A ceramic coating is a liquid applied by hand that bonds to your car&apos;s clear coat and cures into a hard, glossy layer. It becomes part of the surface rather than sitting on top like wax.</p></div>
      <div><h3>What you&apos;ll notice</h3><p>Deeper gloss, water that beads and sheds, and dirt that lets go with a gentle wash. It also helps resist UV fading and etching from bird droppings and bugs when they&apos;re cleaned off promptly.</p></div>
      <div><h3>What it won&apos;t do</h3><p>It isn&apos;t scratch-proof or chip-proof, and it locks in whatever is under it. Swirls and scratches need paint correction first, which we assess and quote separately.</p></div>
      <div><h3>How it&apos;s applied</h3><p>A thorough wash and decontamination, panel preparation, then the coating, panel by panel. We explain the curing time and when the car can get wet.</p></div>
      <div><h3>Options</h3><p>A 3-year coating (Nasiol ZR53) or a 5-year graphene ceramic coating with a light gloss polish. We recommend one after seeing your paint.</p></div>
      <div><h3>Looking after it</h3><p>Hand wash with a pH-neutral soap and skip automatic brush washes. Regular maintenance details keep the coating performing.</p></div>
    </div>
    <div className="hero-actions"><a className="button" href="/quote?service=ceramic">Request a coating quote</a><a className="text-link" href="/our-work">See coated cars</a></div>
  </section>;
}

export function CorrectionStory() {
  return <section className="section long-story" aria-labelledby="correction-story-heading">
    <div className="section-heading"><p className="eyebrow">Understanding paint correction</p><h2 id="correction-story-heading">Why some marks don&apos;t wash off.</h2></div>
    <div className="story-columns">
      <div><h3>What you&apos;re seeing</h3><p>Swirls, haze and fine scratches are tiny grooves in the clear coat, often from brush washes or dry wiping. Sunlight catches their edges, which dulls the color.</p></div>
      <div><h3>What correction does</h3><p>Machine polishing levels a very thin layer of clear coat so light reflects evenly again. The result is clarity and depth, not just shine.</p></div>
      <div><h3>What it can&apos;t fix</h3><p>Scratches that go through the clear coat, rock chips and failing paint. We check your paint first and tell you honestly what can and can&apos;t be improved.</p></div>
      <div><h3>Pair it with protection</h3><p>A freshly corrected finish is the ideal base for a ceramic coating, which helps it stay that way.</p></div>
    </div>
    <div className="hero-actions"><a className="button" href="/quote?service=correction">Request a paint assessment</a><a className="text-link" href="/ceramic-coating">About ceramic coating</a></div>
  </section>;
}
