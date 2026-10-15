// Camotive logo, redrawn as a vector from the brand artwork: the bevelled brushed-steel
// "C" beside the extended "CAMOTIVE / DETAILING" wordmark. The lettering is Michroma
// (SIL Open Font License), widened to the logo's proportions and outlined, so no font
// loads for it. Colors come from --steel-* tokens, which the light theme darkens.
import { useId } from "react";

// The "C": outer radius 150, inner 93, both arms cut at the same angle, lower arm shorter.
const C = "M150 0H343L290 57H150A93 93 0 0 0 150 243H283L226 300H150A150 150 0 0 1 150 0Z";
const NAME = "M7.7 51.3V48.7Q7.7 35.4 8.9 26.4Q10.1 17.4 13 11.7Q15.9 6.1 21 3.1Q26.1 0.1 33.7 -1Q41.4 -2.1 52.2 -2.1H76.3Q88.6 -2.1 97.1 -0.8Q105.6 0.5 110.8 4.2Q116 7.9 118.3 15.2Q120.6 22.5 120.6 34.4H109.1Q109.1 25 107.6 19.8Q106 14.5 102.3 12.2Q98.6 9.8 92.3 9.3Q86 8.7 76.3 8.7H52.2Q43.6 8.7 37.7 9.3Q31.9 9.8 28.2 11.8Q24.5 13.8 22.6 18.1Q20.6 22.4 19.9 29.8Q19.2 37.2 19.2 48.7V51.3Q19.2 62.4 19.9 69.7Q20.6 77 22.6 81.3Q24.5 85.7 28.2 87.8Q31.9 90 37.7 90.6Q43.6 91.3 52.2 91.3H76.3Q86 91.3 92.3 90.8Q98.6 90.4 102.3 88.2Q106 85.9 107.6 80.8Q109.1 75.6 109.1 66.2H120.6Q120.6 78.2 118.3 85.4Q116 92.5 110.8 96.1Q105.6 99.7 97.1 100.9Q88.6 102.1 76.3 102.1H52.2Q38.7 102.1 30 100.1Q21.3 98.1 16.4 92.8Q11.6 87.4 9.6 77.4Q7.7 67.4 7.7 51.3ZM132.3 100 186 0H201.3L255 100H241.6L230.1 77.1H157.2L145.7 100ZM163 66.7H224.3L193.6 8.3ZM270.5 100V0H287.7L343.3 81.6L398.1 0H415.3V100H403.8V11.3L348.8 93.4H338.4L282 11.3V100ZM479.2 102.1Q465.7 102.1 457 100.1Q448.3 98.1 443.4 92.8Q438.6 87.4 436.6 77.4Q434.7 67.4 434.7 51.3V48.7Q434.7 35.4 435.9 26.4Q437.1 17.4 440 11.7Q442.9 6.1 448 3.1Q453.1 0.1 460.7 -1Q468.4 -2.1 479.2 -2.1H503.3Q514.1 -2.1 521.8 -1Q529.4 0.1 534.5 3.1Q539.5 6.1 542.5 11.7Q545.4 17.4 546.6 26.4Q547.8 35.4 547.8 48.7V51.3Q547.8 67.4 545.9 77.4Q543.9 87.4 539 92.8Q534.2 98.1 525.5 100.1Q516.8 102.1 503.3 102.1ZM479.2 91.3H503.3Q511.9 91.3 517.7 90.6Q523.6 90 527.3 87.8Q531 85.7 532.9 81.3Q534.9 77 535.6 69.7Q536.3 62.4 536.3 51.3V48.7Q536.3 37.2 535.6 29.8Q534.9 22.4 532.9 18.1Q531 13.8 527.3 11.8Q523.6 9.8 517.7 9.3Q511.9 8.7 503.3 8.7H479.2Q470.6 8.7 464.7 9.3Q458.9 9.8 455.2 11.8Q451.5 13.8 449.5 18.1Q447.6 22.4 446.9 29.8Q446.2 37.2 446.2 48.7V51.3Q446.2 62.4 446.9 69.7Q447.6 77 449.5 81.3Q451.5 85.7 455.2 87.8Q458.9 90 464.7 90.6Q470.6 91.3 479.2 91.3ZM607.1 100V10.4H561.1V0H664.6V10.4H618.6V100ZM681.7 100V0H693.2V100ZM758.4 100 708.8 0H722L766.1 91.1L810.2 0H823.1L773.7 100ZM838.9 100V0H929.2V10.4H850.4V43.7H925.9V54.2H850.4V89.6H930.9V100Z";
const SUB = "M162 200.2V154H193.6Q199.8 154 203.8 154.8Q207.8 155.6 210.1 158Q212.4 160.3 213.3 164.7Q214.2 169.2 214.2 176.5V177.7Q214.2 184.8 213.3 189.2Q212.4 193.7 210.1 196.1Q207.8 198.5 203.8 199.4Q199.8 200.2 193.6 200.2ZM167.3 195.3H193.6Q198.5 195.3 201.6 194.7Q204.6 194.2 206.2 192.5Q207.7 190.8 208.3 187.3Q208.8 183.7 208.8 177.7V176.5Q208.8 171.5 208.5 168.3Q208.2 165 207.3 163.1Q206.4 161.3 204.7 160.4Q203 159.5 200.3 159.2Q197.5 159 193.6 159H167.3ZM247.4 200.2V154H289.2V158.8H252.7V174.2H287.6V179.1H252.7V195.4H289.9V200.2ZM339.9 200.2V158.8H318.7V154H366.5V158.8H345.3V200.2ZM395.3 200.2 420.1 154H427.2L452 200.2H445.8L440.5 189.7H406.8L401.5 200.2ZM409.4 184.8H437.8L423.6 157.9ZM483.4 200.2V154H488.8V200.2ZM523.8 200.2V154H529.1V195.4H562.8V200.2ZM594.2 200.2V154H599.5V200.2ZM634.5 200.2V154H640.1L682.8 193.1H682.9V154H688.2V200.2H682.6L639.9 160.8H639.8V200.2ZM721.4 177.7V176.5Q721.4 170.4 722 166.2Q722.5 162 723.9 159.4Q725.2 156.8 727.6 155.4Q729.9 154 733.5 153.5Q737 153 742 153H752.4Q758.9 153 763 153.6Q767.1 154.1 769.3 155.7Q771.5 157.2 772.3 160.1Q773.2 163.1 773.2 167.8H767.9Q767.9 164.2 767.3 162.2Q766.7 160.2 765.1 159.3Q763.5 158.5 760.4 158.2Q757.4 158 752.4 158H742Q738 158 735.3 158.3Q732.6 158.5 730.9 159.5Q729.2 160.4 728.3 162.4Q727.4 164.4 727.1 167.8Q726.7 171.2 726.7 176.5V177.7Q726.7 182.8 727.1 186.2Q727.4 189.6 728.3 191.6Q729.2 193.6 730.9 194.6Q732.6 195.6 735.3 195.9Q738 196.2 742 196.2H754.3Q758.8 196.2 761.6 195.8Q764.4 195.4 765.9 194.1Q767.3 192.7 767.8 190Q768.3 187.2 768.3 182.5V180.7H748V175.9H773.7V182.5Q773.7 188.4 772.7 192.1Q771.8 195.7 769.6 197.7Q767.5 199.7 763.7 200.5Q760 201.2 754.3 201.2H742Q735.8 201.2 731.7 200.3Q727.7 199.4 725.5 196.9Q723.2 194.4 722.3 189.8Q721.4 185.2 721.4 177.7Z";

const steel = (n: 1 | 2 | 3, fallback: string) => ({ stopColor: `var(--steel-${n}, ${fallback})` });

export default function Logo({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const u = (name: string) => `url(#${id}-${name})`;
  return <svg className={`logo ${className}`} viewBox="0 -2 1265 234" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-face`} x1="0" y1="0" x2=".12" y2="1">
        <stop offset="0" style={steel(1, "#ededf1")} /><stop offset=".26" style={steel(2, "#b7b7bf")} />
        <stop offset=".52" style={steel(3, "#7a7a84")} /><stop offset=".78" style={steel(2, "#b7b7bf")} />
        <stop offset="1" style={steel(1, "#e2e2e7")} />
      </linearGradient>
      <linearGradient id={`${id}-bevel`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" /><stop offset=".42" stopColor="#d6d6dc" />
        <stop offset=".58" stopColor="#5a5a63" /><stop offset="1" stopColor="#26252c" />
      </linearGradient>
      <linearGradient id={`${id}-type`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={steel(1, "#fbfbfd")} /><stop offset=".46" style={steel(2, "#d4d4db")} />
        <stop offset=".58" style={steel(3, "#6c6c77")} /><stop offset="1" style={steel(2, "#d4d4db")} />
      </linearGradient>
      {/* Horizontal brushing: noise stretched along x, kept faint. */}
      <filter id={`${id}-brush`} x="0" y="0" width="1" height="1">
        <feTurbulence type="fractalNoise" baseFrequency=".006 .7" numOctaves={2} seed={7} />
        <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1.2 0 -.45" />
      </filter>
      <filter id={`${id}-emboss`} x="-2%" y="-6%" width="104%" height="112%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="b" />
        <feSpecularLighting in="b" surfaceScale="4" specularConstant=".9" specularExponent="18" lightingColor="#fff" result="s"><feDistantLight azimuth={225} elevation={35} /></feSpecularLighting>
        <feComposite in="s" in2="SourceAlpha" operator="in" result="si" />
        <feComposite in="SourceGraphic" in2="si" operator="arithmetic" k2={1} k3={.6} />
      </filter>
      <clipPath id={`${id}-clip`}><path d={C} /></clipPath>
      {/* The face sits inset from the edge; the band left around it is the bevel. */}
      <mask id={`${id}-inset`} maskUnits="userSpaceOnUse" x="-10" y="-10" width="365" height="322"><path d={C} fill="#fff" stroke="#000" strokeWidth="15" strokeLinejoin="round" /></mask>
      <mask id={`${id}-seam`} maskUnits="userSpaceOnUse" x="-10" y="-10" width="365" height="322"><path d={C} fill="#fff" stroke="#000" strokeWidth="13" strokeLinejoin="round" /></mask>
    </defs>
    <g transform="scale(0.76159)">
      <path d={C} fill={u("bevel")} />
      <g mask={u("inset")}><path d={C} fill={u("face")} /><rect width="345" height="302" filter={u("brush")} opacity=".35" style={{ mixBlendMode: "overlay" }} /></g>
      <path d={C} fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="17" strokeLinejoin="round" mask={u("seam")} clipPath={u("clip")} />
      <path d={C} fill="none" stroke="var(--steel-edge, #0d0c11)" strokeOpacity=".6" strokeWidth="2" strokeLinejoin="round" />
    </g>
    <g transform="translate(326.7 14.9)" filter={u("emboss")} fill={u("type")} stroke={u("type")} strokeLinejoin="round">
      <path d={NAME} strokeWidth="6.5" /><path d={SUB} strokeWidth="3.6" />
    </g>
  </svg>;
}
