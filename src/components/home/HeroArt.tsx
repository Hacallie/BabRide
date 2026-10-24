/** Illustrative artwork only. NOT a real map and NOT real vehicle positions. */
export default function HeroArt({ className = "" }: { className?: string }) {
  return (
    <figure className={className}>
      <svg viewBox="0 0 520 260" role="img" aria-label="Illustration of a tricycle travelling a route between two campus markers" className="h-auto w-full">
        <defs>
          <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="#fff" strokeOpacity=".06" /></pattern>
          <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4C82F5" /><stop offset="1" stopColor="#245CE2" /></linearGradient>
        </defs>
        <rect width="520" height="260" rx="20" fill="url(#grid)" />
        <g fill="none" stroke="#fff" strokeOpacity=".12" strokeWidth="14" strokeLinecap="round"><path d="M30 190C120 190 140 80 250 90S400 60 490 40" /><path d="M120 240C150 160 230 170 300 150" strokeWidth="8" /></g>
        <path className="route-line" d="M30 190C120 190 140 80 250 90S400 60 490 40" fill="none" stroke="#B9C9E8" strokeWidth="3" strokeLinecap="round" />
        <circle cx="30" cy="190" r="9" fill="#071A3D" stroke="#fff" strokeWidth="3" />
        <g transform="translate(490 40)"><circle r="16" fill="#DDBB62" opacity=".22" /><path d="M0-14a9 9 0 0 1 9 9c0 6.5-9 14-9 14s-9-7.500-9-14a9 9 0 0 1 9-9Z" fill="#DDBB62" /><circle cy="-5" r="3.2" fill="#071A3D" /></g>
        {/* tricycle */}
        <g transform="translate(150 118)">
          <ellipse cx="88" cy="112" rx="92" ry="7" fill="#000" opacity=".25" />
          <path d="M60 18h86c10 0 16 6 18 16l6 38H60Z" fill="url(#body)" />
          <path d="M52 18c0-8 8-14 18-14h72c14 0 22 6 24 16H52Z" fill="#fff" />
          <path d="M74 30h38v24H74z M120 30h30c6 0 10 3 11 8l3 16h-44z" fill="#071A3D" opacity=".78" />
          <path d="M60 72H30c-8 0-12-6-12-12V50c0-4 3-8 8-8h20" fill="#fff" />
          <path d="M20 44l-6-14M6 30h18" stroke="#B9C9E8" strokeWidth="4" strokeLinecap="round" fill="none" />
          <rect x="60" y="72" width="108" height="10" rx="4" fill="#0A2454" />
          <circle cx="102" cy="48" r="0" />
          <g><circle cx="34" cy="96" r="16" fill="#071A3D" /><circle cx="34" cy="96" r="7" fill="#B9C9E8" /></g>
          <g><circle cx="116" cy="96" r="16" fill="#071A3D" /><circle cx="116" cy="96" r="7" fill="#B9C9E8" /></g>
          <g><circle cx="152" cy="96" r="16" fill="#071A3D" /><circle cx="152" cy="96" r="7" fill="#B9C9E8" /></g>
          <circle cx="170" cy="62" r="3.5" fill="#DDBB62" />
        </g>
      </svg>
      <figcaption className="mt-1 text-xs text-mist/80">Illustration only. Not a live map or real GPS data.</figcaption>
    </figure>
  );
}
