import Link from "next/link";
import BookingPanel from "@/components/home/BookingPanel";
import CampusDestinations from "@/components/home/CampusDestinations";
import HeroArt from "@/components/home/HeroArt";
import { BrandMark } from "@/components/Brand";
import { FIXED_FARE_KOBO, formatNaira } from "@/lib/fare";

const fare = formatNaira(FIXED_FARE_KOBO);
const steps: [string, string][] = [
  ["Pick your spots", "Choose pickup and destination from campus landmarks, or share your current location."],
  ["See the fare up front", `Every passenger pays ${fare}, whatever the distance.`],
  ["Get matched", "An approved rider accepts your request. You see their name and tricycle number."],
  ["Ride and pay", "Pay cash to the rider. Electronic payment is coming soon."],
];

export default function Home() {
  return (
    <>
      <section className="hero-bg on-dark text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-12 pt-8 sm:pt-12 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:gap-12 lg:pb-20 lg:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-mist">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Campus tricycles only
            </p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]">Your campus.<br />Your ride.</h1>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-mist">Move around Babcock with a campus tricycle ride for just {fare}.</p>
            <HeroArt className="mt-8 hidden max-w-lg sm:block" />
          </div>
          <BookingPanel />
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <section id="how" aria-labelledby="how-h" className="scroll-mt-20 py-14">
          <h2 id="how-h" className="text-2xl font-bold text-navy-950 sm:text-3xl">How Bab Ride works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(([t, d], i) => (
              <li key={t} className="rounded-xl2 border border-navy-100 bg-white p-5 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 text-lg font-semibold text-navy-950">{t}</h3>
                <p className="mt-1.5 text-navy-800">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="campus" aria-labelledby="campus-h" className="scroll-mt-20 pb-14">
          <h2 id="campus-h" className="text-2xl font-bold text-navy-950 sm:text-3xl">Campus locations</h2>
          <p className="mt-2 max-w-xl text-navy-800">Tap a landmark to set it as your destination.</p>
          <div className="mt-5"><CampusDestinations /></div>
        </section>

        <section aria-labelledby="fare-h" className="on-dark hero-bg overflow-hidden rounded-xl2 p-7 text-white sm:p-10">
          <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
            <p className="text-6xl font-extrabold tracking-tight sm:text-7xl" aria-hidden="true">{fare}</p>
            <div>
              <h2 id="fare-h" className="text-2xl font-bold">One fare. Always {fare}.</h2>
              <p className="mt-2 max-w-xl text-mist">The server sets and checks the fare, never the app on your phone, and riders can’t change it. It doesn’t rise with distance, time or demand. Requests outside the campus service area are declined, not charged.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="rider-h" className="py-14">
          <div className="grid items-center gap-6 rounded-xl2 border border-navy-100 bg-white p-7 shadow-sm sm:grid-cols-[1fr_auto] sm:p-9">
            <div>
              <h2 id="rider-h" className="text-2xl font-bold text-navy-950">Ride a tricycle on campus?</h2>
              <p className="mt-2 max-w-xl text-navy-800">Apply online. An administrator reviews every application, and only approved riders can accept rides.</p>
            </div>
            <Link href="/rider/join" className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-royal px-6 font-semibold text-white hover:bg-[#1d4fc7]">Become a rider</Link>
          </div>
        </section>
      </div>

      <footer className="on-dark bg-navy-950 text-mist">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm">
          <div className="flex items-center gap-2 text-white"><BrandMark className="h-7 w-7" /><b>Bab Ride</b><span className="text-mist">· Your campus. Your ride.</span></div>
          <p>A campus tricycle booking platform for Babcock University, Nigeria. Not affiliated with, endorsed by, or approved by Babcock University unless and until that authorization is obtained.</p>
        </div>
      </footer>
    </>
  );
}