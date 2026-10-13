import Link from "next/link";
import styles from "./ServiceStories.module.css";

// The homepage overview of what Camotive does. One photo per service, each used
// only once on the page, and plain descriptions written as the team ("we").
function Photo({ file, alt }: { file: string; alt: string }) {
  return <figure className={styles.photo}>
    <img src={`/work/${file}.jpg`} alt={alt} width={1200} height={1600} loading="lazy" decoding="async" />
  </figure>;
}

const services = [
  {
    id: "exterior", eyebrow: "Exterior detailing", title: "A proper hand wash, inside the details.",
    text: "We hand wash the paint, clean the wheels, tires and trim, and finish the glass, so the car looks cared for from every angle, not just from the driveway.",
    photo: "bmw-foam", alt: "BMW covered in wash foam during an exterior detail",
    action: <Link className="button" href="/book?service=full">Book a Full Detail</Link>,
  },
  {
    id: "interior", eyebrow: "Interior detailing", title: "A cabin that feels new again.",
    text: "Seats, carpets, mats, vents and touch points are vacuumed, cleaned and protected. For stains, spills or pet hair, the Premium Detail adds shampoo or extraction and leather care.",
    photo: "mclaren-interior", alt: "McLaren red leather and Alcantara interior after detailing",
    action: <Link className="button" href="/book?service=premium">Book a Premium Detail</Link>,
  },
  {
    id: "correction", eyebrow: "Paint correction", title: "Swirls and haze, polished out.",
    text: "When sunlight shows swirls instead of color, washing won't fix it. We machine polish the clear coat to bring back clarity. We look at your paint first and quote what it actually needs.",
    photo: "tundra-finish", alt: "Reflections along the bed and tailgate of a silver Toyota Tundra",
    action: <Link className="button" href="/quote?service=correction">Request a quote</Link>,
  },
  {
    id: "coating", eyebrow: "Ceramic coating", title: "Protection that lasts for years.",
    text: "A ceramic coating bonds to the paint and adds a hard, glossy layer that sheds water and makes every wash easier. Choose a 3-year or 5-year coating, quoted after we see the car.",
    photo: "mach-e-front", alt: "Ceramic coated Mustang Mach-E GT",
    action: <Link className="button" href="/ceramic-coating">About ceramic coating</Link>,
  },
];

export default function ServiceStories() {
  return <section className={`section ${styles.stories}`} id="services" aria-labelledby="services-heading">
    <header className={styles.intro}>
      <div><p className="eyebrow">What we do</p><h2 id="services-heading">Detailing, correction<br />and protection.</h2></div>
      <p>We&apos;re a mobile detailing team serving all of San Antonio. Detailing is booked online. Paint correction and ceramic coating are quoted first, because every finish is different.</p>
    </header>
    <nav className={styles.index} aria-label="Our services">
      {services.map(s => <a key={s.id} href={`#story-${s.id}`}>{s.eyebrow}</a>)}
    </nav>
    {services.map((s, i) => <article key={s.id} id={`story-${s.id}`} className={`${styles.story} ${i % 2 ? styles.reverse : ""}`} aria-labelledby={`${s.id}-heading`}>
      <div className={styles.copy}>
        <p className="eyebrow">{s.eyebrow}</p>
        <h3 id={`${s.id}-heading`}>{s.title}</h3>
        <p>{s.text}</p>
        {s.action}
      </div>
      <div className={styles.single}><Photo file={s.photo} alt={s.alt} /></div>
    </article>)}
  </section>;
}
