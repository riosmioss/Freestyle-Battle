// Subtle animated film-grain overlay rendered above everything (pointer-events
// off). Uses an inline SVG fractal-noise data URI so there are no asset deps.
const NOISE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>
      <filter id='n'>
        <feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/>
        <feColorMatrix type='saturate' values='0'/>
      </filter>
      <rect width='100%' height='100%' filter='url(#n)' opacity='0.5'/>
    </svg>`,
  );

export default function Grain() {
  return <div className="grain" style={{ backgroundImage: `url("${NOISE}")` }} aria-hidden />;
}
