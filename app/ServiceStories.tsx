import Link from "next/link";
import styles from "./ServiceStories.module.css";

function Photo({ file, alt, label, caption }: { file: string; alt: string; label: string; caption: string }) {
  return <figure className={styles.photo}>
    <img src={`/work/${file}.jpg`} alt={alt} width={1200} height={1600} loading="lazy" decoding="async" />
    <figcaption><span>{label}</span>{caption}</figcaption>
  </figure>;
}

export default function ServiceStories() {
  return <section className={`section ${styles.stories}`} id="services" aria-labelledby="services-heading">
    <header className={styles.intro}>
      <div><p className="eyebrow">What we do</p><h2 id="services-heading">Picture your car<br />feeling like this.</h2></div>
      <p>The dust on the drive home. The mess in the back seat. The finish you wish would shine again. Start with what you want to change—we’ll help you get there.</p>
    </header>
    <nav className={styles.index} aria-label="Explore service stories">
      <a href="#story-exterior">Exterior</a><a href="#story-interior">Interior</a><a href="#story-correction">Paint correction</a><a href="#story-coating">Ceramic coating</a><a href="#story-tint">Window tint</a>
    </nav>

    <article id="story-exterior" className={styles.story} aria-labelledby="exterior-heading">
      <div className={styles.copy}>
        <p className="eyebrow">Exterior detailing</p>
        <h3 id="exterior-heading">Under the road grime,<br />it’s still your pride and joy.</h3>
        <p>Between bugs, dust and everyday miles, that just-washed feeling disappears fast. We carefully wash the exterior and work through the wheels, trim and finishing touches. The result is a car you want to look back at when you park—not another job on your weekend list.</p>
        <Link className="button" href="/book?service=full">Give my car a fresh start</Link>
        <p className={styles.note}>In the photos: a McLaren during its wash and its finished exterior.</p>
      </div>
      <div className={styles.pair}>
        <Photo file="mclaren-rear" alt="Water and wash foam on the rear of a black McLaren" label="During the wash" caption="Care reaches beyond the panels you see first." />
        <Photo file="mclaren-front" alt="Front view of the black McLaren with a reflective finish" label="The finished detail" caption="A clean finish worth a second look." />
      </div>
      <details className={styles.film}>
        <summary>See the care in motion <span>Lamborghini foam-wash film · tap to open</span></summary>
        <figure><video controls playsInline preload="none" poster="/work/detail-2282.jpg" aria-label="Lamborghini during its foam wash"><source src="/work/detail-2282.mp4" type="video/mp4" /><a href="/work/detail-2282.mp4">Watch the foam-wash video</a></video><figcaption>A separate customer vehicle, filmed during its foam wash. No finished-result comparison is implied.</figcaption></figure>
      </details>
    </article>

    <article id="story-interior" className={`${styles.story} ${styles.reverse}`} aria-labelledby="interior-heading">
      <div className={styles.copy}>
        <p className="eyebrow">Interior detailing</p>
        <h3 id="interior-heading">Open the door.<br />Leave the day’s mess behind.</h3>
        <p>Your car carries the school runs, workdays and everything in between. We focus on the places that collect it all: floor mats, seats, touch points and those easy-to-miss corners. A freshly detailed cabin makes the next drive feel like a reset, without you spending your afternoon cleaning it.</p>
        <Link className="button" href="/contact#quote">Let’s refresh my interior</Link>
        <p className={styles.note}>A closer look at this Tundra’s detailed cabin—not a staged before-and-after.</p>
      </div>
      <div className={styles.pair}>
        <Photo file="tundra-driver-floor" alt="Detailed Toyota Tundra driver footwell, carpet and rubber mat" label="The little things" caption="The floor beneath your feet deserves attention, too." />
        <Photo file="tundra-cabin" alt="Toyota Tundra front seats and dashboard after detailing" label="The bigger picture" caption="A cabin ready for the next part of your day." />
      </div>
    </article>

    <article id="story-correction" className={styles.story} aria-labelledby="correction-heading">
      <div className={styles.copy}>
        <p className="eyebrow">Paint correction</p>
        <h3 id="correction-heading">When a wash can’t<br />bring the shine back.</h3>
        <p>If sunlight brings out swirls instead of the color you love, another wash won’t solve it. We assess your paint, then recommend a polishing approach to reduce suitable surface imperfections and bring back clarity. You get a finish you can feel proud of, with an honest conversation about what can—and can’t—be improved.</p>
        <Link className="button" href="/contact#quote">Take a look at my paint</Link>
      </div>
      <div className={styles.single}>
        <Photo file="tundra-finish" alt="Reflections on the silver Toyota Tundra bed and tailgate" label="Look at the reflections" caption="Camotive’s Tundra detail. A finish reference, not a documented paint-correction result." />
      </div>
    </article>

    <article id="story-coating" className={`${styles.story} ${styles.reverse}`} aria-labelledby="coating-heading">
      <div className={styles.copy}>
        <p className="eyebrow">Ceramic coating</p>
        <h3 id="coating-heading">Love the finish.<br />Make it easier to keep.</h3>
        <p>Texas roads don’t give your paint much of a break. We prepare the surface and apply a ceramic coating suited to your vehicle, adding gloss and a protective layer that makes routine washing easier. You spend less time fighting stuck-on grime and more time enjoying the car you chose—regular care still matters.</p>
        <Link className="button" href="/ceramic-coating">Find protection for my car</Link>
        <p className={styles.note}>Paint correction is assessed and quoted separately.</p>
      </div>
      <div className={styles.single}>
        <Photo file="mclaren-hero" alt="Black McLaren with its door raised and reflections along its bodywork" label="A finish worth caring for" caption="A customer McLaren from our detail portfolio; coating treatment is not documented for this photo." />
      </div>
    </article>

    <aside id="story-tint" className={styles.tint} aria-labelledby="tint-heading">
      <div><p className="eyebrow">Thinking about window tint?</p><h3 id="tint-heading">Start with how you want<br />your cabin to feel.</h3></div>
      <div><p>Looking for more privacy or less glare? Tell Cam what you drive and what you’d like to change. Ask about availability and a real before-and-after example before choosing your next step.</p><Link className="text-link" href="/contact#quote">Ask Cam about tint</Link></div>
    </aside>
    <footer className={styles.end}><p>Your car doesn’t have to look like these to deserve this care.</p><Link className="text-link" href="/contact#quote">Send Cam a photo of your vehicle</Link></footer>
  </section>;
}
