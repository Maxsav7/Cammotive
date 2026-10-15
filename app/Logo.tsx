// Camotive logo: the brand artwork itself. The "C" and the CAMOTIVE / DETAILING
// lettering are cut from the original image with their bevels, brushing and shadows,
// and set side by side for the header (public/brand/camotive-logo.webp,
// 160px tall: sharp at 2-3x pixel density). The surrounding link carries the accessible name.
export default function Logo({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- fixed-size brand image, no optimizer needed
  return <img className={`logo ${className}`} src="/brand/camotive-logo.webp" alt="" width={640} height={160} decoding="async" />;
}
