// Terms of Service for Camotive Detailing, at /terms. Customers accept these when
// booking (BookingFlow), and the version they accepted is stored with the booking.
// Figures come from the booking catalog so the terms never drift from the site.
// After changing any wording, bump TERMS_VERSION in lib/terms.ts.
import { depositDollars, firstVisitDiscount, holdMinutes, slotLabel, bookingTimes } from "../lib/booking-catalog";
import { TERMS_EFFECTIVE, RECORD_RETENTION_DAYS } from "../lib/terms";

const phone = <a href="tel:+12105730671">(210) 573-0671</a>;
const windows = bookingTimes.map(t => slotLabel[t]).join(", ");

const sections: [id: string, title: string, body: React.ReactNode][] = [
  ["agreement", "Who we are and this agreement", <>
    <p>These terms are an agreement between you and Camotive Detailing (&quot;Camotive&quot;, &quot;we&quot;, &quot;us&quot;), a mobile detailing business in San Antonio, Texas, owned and operated by Camron Freeman.</p>
    <p>They apply to every appointment, however you book it: on this website, by text, or by phone. When you book online you&apos;ll be asked to tick a box confirming you agree. Booking by text or phone, or letting us start work, also means you accept them.</p>
    <p>You must be at least 18 to book.</p>
  </>],
  ["services", "Services and prices", <>
    <p>Prices on this website are starting prices for each vehicle size. When we arrive, we look over the vehicle and <strong>confirm the final price with you before any work begins</strong>.</p>
    <p>The price can be higher than the starting price when the vehicle needs more work than the service includes. Excessive pet hair or sand removal starts at $50. Severe stains, smoke, urine, mildew, mold and unusually neglected vehicles are quoted separately.</p>
    <p>If you don&apos;t want to pay a higher price, you can choose the service as booked with a narrower scope, or end the appointment. Ending it at that point counts as a cancellation by you (section 5).</p>
    <p>Ceramic coating and paint correction are quoted individually after we assess the vehicle. The quote we give you sets the price and what&apos;s included.</p>
  </>],
  ["results", "What to expect from results", <>
    <p>We work carefully and do our best on every vehicle, but some things can&apos;t always be fully fixed by detailing. These include permanent stains, sun damage, odors from deep in the vehicle, worn or faded materials, and scratches that go through the clear coat. Paint correction reduces swirls and scratches. It doesn&apos;t make paint perfect, and how much can be removed depends on how thick and healthy the paint is.</p>
    <p>Interior surfaces and carpets can stay damp for several hours after cleaning. A ceramic coating needs time to cure. We&apos;ll tell you how to care for it afterwards, and its results and lifespan depend on following that care.</p>
  </>],
  ["booking", "Booking and the deposit", <>
    <p>Online bookings need a <strong>${depositDollars} deposit</strong>, paid on Stripe&apos;s secure checkout. We hold your time for {holdMinutes} minutes while you pay. The booking is confirmed once the deposit is paid. The deposit goes toward your total.</p>
    <p>New customers get <strong>${firstVisitDiscount} off their first online booking</strong>. It&apos;s applied automatically to the first booking made with an email address and phone number that haven&apos;t booked with us before. It can only be used once per customer. We may remove it if it&apos;s claimed again using a different email or phone number.</p>
    <p>The rest of the price is due when the work is finished. Pay with one of the payment methods we accept at the appointment.</p>
  </>],
  ["cancelling", "Cancelling or changing your appointment", <>
    <p>You can cancel anytime from <a href="/appointment">My appointments</a>. <strong>If you cancel, the ${depositDollars} deposit is non-refundable.</strong> It covers the time we kept for you and turned other customers away from.</p>
    <p>To reschedule, call or text us at {phone} at least 24 hours before your appointment. We&apos;ll move it to another open time and carry your deposit over. With less notice, a change is treated as a cancellation, although we&apos;ll try to work with you.</p>
    <p>An appointment also counts as a cancellation by you, and the deposit is kept, if we can&apos;t do the work because:</p>
    <ul>
      <li>you&apos;re not there and can&apos;t be reached within 20 minutes of our arrival, or</li>
      <li>we can&apos;t get to the vehicle, the keys, or the water and power we need.</li>
    </ul>
  </>],
  ["our-cancellations", "If we need to cancel or reschedule", <>
    <p>Sometimes we have to move an appointment for rain or unsafe weather, illness, an emergency, or a vehicle or equipment problem. When that happens, we&apos;ll contact you as early as we can.</p>
    <p>You can choose a new time at no charge, or a <strong>full refund of your deposit</strong>. If we cancel and don&apos;t rebook, we refund your deposit in full.</p>
    <p>Interior-only work can often still go ahead in the rain.</p>
  </>],
  ["arrival", "Arrival windows and timing", <>
    <p>Appointments are booked in arrival windows ({windows}). We aim to arrive at the start of your window. Traffic and earlier jobs can delay us, and we&apos;ll keep you updated.</p>
    <p>How long a job takes depends on the vehicle&apos;s size and condition and the services chosen. Any time we give is an estimate.</p>
  </>],
  ["your-part", "Your part", <>
    <p>By booking, you confirm that:</p>
    <ul>
      <li>you own the vehicle or have the owner&apos;s permission to have it detailed;</li>
      <li>you have permission to have the work done at the location, including any HOA, apartment, building or workplace approval, and you&apos;ll give us gate codes and parking instructions;</li>
      <li>an outdoor water connection and a power outlet are within reach of the vehicle, and you agree to us using a reasonable amount of each;</li>
      <li>the vehicle is in a safe spot where we can work all the way around it;</li>
      <li>you&apos;ll tell us before we start about:
        <ul>
          <li>damage, loose or fragile parts;</li>
          <li>aftermarket wraps, film or paint protection film;</li>
          <li>repainted panels;</li>
          <li>electrical problems;</li>
          <li>anything else we should know.</li>
        </ul>
      </li>
    </ul>
    <p>Please keep children and pets away from the work area.</p>
  </>],
  ["belongings", "Personal belongings", <>
    <p>Please take money, valuables, documents and personal items out of the vehicle before we arrive. We&apos;ll gather loose items we find and leave them in the vehicle. We aren&apos;t responsible for items left in the vehicle, including any that are lost or damaged while we clean.</p>
  </>],
  ["condition", "Vehicle condition and existing damage", <>
    <p>We may look the vehicle over and take photos before we start, so we both have a record of its condition.</p>
    <p>We aren&apos;t responsible for damage that was already there, or that comes from a condition the vehicle already had. That includes:</p>
    <ul>
      <li>failing or thin clear coat, earlier repaints or touch-ups;</li>
      <li>rock chips and rust;</li>
      <li>loose, brittle or sun-damaged trim, plastics, seals and emblems;</li>
      <li>worn or torn upholstery;</li>
      <li>aftermarket parts, wraps, film or decals;</li>
      <li>electrical, sensor or mechanical faults.</li>
    </ul>
    <p>Engine bay cleaning is done with care and sensitive parts are protected, but it&apos;s at your risk on older vehicles or ones with existing electrical issues.</p>
  </>],
  ["claims", "If something goes wrong", <>
    <p>If you&apos;re not happy with part of the work, tell us before we leave or within 24 hours, and we&apos;ll come back to put it right at no charge.</p>
    <p>If you believe we damaged your vehicle or property:</p>
    <ul>
      <li>tell us within 48 hours, with photos;</li>
      <li>let us inspect it before any repair is made.</li>
    </ul>
    <p>If we&apos;re responsible, we&apos;ll arrange a repair or pay the reasonable cost of one, whichever we choose.</p>
    <p>To the extent the law allows, our total liability for any appointment is limited to the amount you paid for it. We aren&apos;t liable for indirect losses, such as loss of use of the vehicle, rental costs or lost time.</p>
    <p>Nothing in these terms limits a right you have under Texas law that can&apos;t be limited by agreement, or our liability for our own gross negligence or willful misconduct.</p>
  </>],
  ["photos", "Photos and videos", <>
    <p>We may photograph or film the vehicle and our work. We use these to record its condition and to show our work on this website and our social media.</p>
    <p>We don&apos;t show license plates or personal details. If you&apos;d rather your vehicle not be shown publicly, just tell us.</p>
  </>],
  ["privacy", "Your information", <>
    <p>We use your name, phone number, email, address and vehicle details only to:</p>
    <ul>
      <li>schedule and do the work;</li>
      <li>send your confirmation, reminder and appointment emails;</li>
      <li>contact you about your appointment.</li>
    </ul>
    <p>Deposits are processed by Stripe; we never see or store your card number.</p>
    <p>Your details are stored encrypted, and booking records are deleted automatically about {Math.round(RECORD_RETENTION_DAYS / 30)} months after the appointment. We don&apos;t sell your information, and we don&apos;t send marketing messages without your permission.</p>
  </>],
  ["law", "Disputes and Texas law", <>
    <p>If there&apos;s a problem, please contact us first. Most things can be sorted out with a call.</p>
    <p>These terms are governed by the laws of the State of Texas. Any dispute will be handled in the courts of Bexar County, Texas, including justice (small claims) court.</p>
  </>],
  ["changes", "Changes to these terms", <>
    <p>We may update these terms from time to time, and the date at the top shows the latest version. Each booking is covered by the version you accepted when you made it.</p>
  </>],
  ["contact", "Contact us", <>
    <p>Call or text {phone}, or reply to any of your booking emails.</p>
  </>],
];

export default function TermsOfService() {
  return <section className="section terms" aria-labelledby="terms-summary">
    <aside className="terms-toc" aria-label="Sections">
      <p>Effective {TERMS_EFFECTIVE}</p>
      <ol>{sections.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}</ol>
    </aside>
    <div className="terms-body">
      <div className="terms-summary">
        <h2 id="terms-summary">The short version</h2>
        <ul>
          <li>A <strong>${depositDollars} deposit</strong> confirms your booking and goes toward your total.</li>
          <li><strong>If you cancel, the deposit is non-refundable.</strong> If we cancel, it&apos;s refunded in full or moved to a new time, your choice.</li>
          <li>We confirm the final price with you <strong>before starting</strong>. The rest is paid when the work is done.</li>
          <li>Please have water and power within reach, clear out valuables, and tell us about any existing damage.</li>
          <li>Not happy with something? Tell us within 24 hours and we&apos;ll come back to fix it.</li>
        </ul>
        <p>This summary is for convenience. The full terms below are what you agree to.</p>
      </div>
      {sections.map(([id, title, body], i) => <article key={id} id={id} className="terms-section">
        <h2><span>{i + 1}</span>{title}</h2>{body}
      </article>)}
    </div>
  </section>;
}
