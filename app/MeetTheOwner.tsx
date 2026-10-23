// "Meet the owner" on the About Us page: Camron's portrait and his own words.
export default function MeetTheOwner() {
  return <section className="section owner" aria-labelledby="owner-heading">
    <div className="owner-copy">
      <p className="eyebrow">Meet the owner</p>
      <h2 id="owner-heading">Driven by detail.</h2>
      <p className="owner-lede">I&apos;m Camron, the owner of Camotive Detailing and a marketing student at UTSA. I&apos;m building my business here in San Antonio with a simple goal: deliver work I&apos;m proud to put my name on and give people someone they can trust with their vehicle.</p>
      <p>My experience in detailing and ceramic coatings has taught me that a great finish starts with careful preparation. I bring that same attention to every vehicle I work on through Camotive.</p>
      <p>Through Camotive, I offer mobile detailing, polishing, and ceramic coatings to help keep your vehicle looking its best. Whether you&apos;re getting a maintenance detail or investing in long-term protection, I take the time to understand what your vehicle needs and explain your options clearly.</p>
      <p>Outside of work and school, you&apos;ll usually find me in the gym, out in nature, or staying active through sports. Being an athlete has taught me discipline, patience, and consistency—qualities I bring to Camotive every day as I continue building my business and improving my craft.</p>
      <p>Camotive is something I&apos;m building one customer at a time. Every booking, referral, and returning client means a lot to me. Thank you for supporting my business and trusting me with your vehicle.</p>
      <p className="owner-signature"><strong>Camron Freeman</strong><span>Owner, Camotive Detailing</span></p>
    </div>
    <figure className="owner-photo">
      <img src="/work/camron-freeman-720.webp" srcSet="/work/camron-freeman-720.webp 720w, /work/camron-freeman-1180.webp 1180w"
        sizes="(max-width: 800px) calc(100vw - 44px), 42vw" width={1180} height={1475} decoding="async"
        alt="Camron Freeman, owner of Camotive Detailing, smiling in a white shirt" />
    </figure>
  </section>;
}
