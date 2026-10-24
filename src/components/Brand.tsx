import Link from "next/link";
/** Bab Ride mark: a route that bends into a location pin. Original artwork. */
export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="13" fill="#245CE2" />
      <rect width="48" height="48" rx="13" fill="url(#bm)" />
      <path d="M12 35c0-7 8-5 8-11s-6-5-6-9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 5.5" opacity=".55" />
      <path d="M12 35c0-7 8-5 8-11 0-3.2 2-5 4.5-5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M33 12.5a7 7 0 0 1 7 7c0 5-7 11.5-7 11.5s-7-6.5-7-11.5a7 7 0 0 1 7-7Z" fill="#fff" />
      <circle cx="33" cy="19.5" r="2.8" fill="#DDBB62" />
      <defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".22" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
    </svg>
  );
}
export const TricycleMark = BrandMark; // backwards-compatible export name

export default function Brand({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Bab Ride home">
      <BrandMark />
      <span className={`text-xl font-extrabold tracking-tight ${tone === "light" ? "text-white" : "text-navy-950"}`}>Bab<span className="text-mist">Ride</span></span>
    </Link>
  );
}
