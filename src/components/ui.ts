export const btn = "inline-flex items-center justify-center rounded-xl px-5 py-3 text-base font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 min-h-[48px]";
export const btnPrimary = `${btn} bg-navy-900 text-white hover:bg-navy-800 active:bg-navy-950`;
/** Main call to action: royal blue. (Name kept so existing pages pick up the new look.) */
export const btnAccent = `${btn} bg-royal text-white shadow-[0_8px_24px_-8px_rgba(36,92,226,.8)] hover:bg-[#1d4fc7]`;
export const btnGhost = `${btn} border border-navy-100 bg-white text-navy-900 hover:bg-navy-50`;
export const btnDanger = `${btn} border border-red-200 bg-white text-red-700 hover:bg-red-50`;
export const card = "rounded-xl2 border border-navy-100 bg-white p-5 shadow-sm";
export const input = "w-full rounded-xl border border-navy-100 bg-white px-4 py-3 text-base text-navy-950 min-h-[48px]";
export const label = "mb-1 block text-sm font-medium text-navy-800";

// Dark "glass" variants: same look as the homepage booking panel. Used on sign-in and rider onboarding.
export const glassInput = "w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-base text-white placeholder:text-mist/80 min-h-[48px] transition focus:border-white/40 focus:bg-white/15 disabled:opacity-60";
export const glassLabel = "mb-1 block text-xs font-medium uppercase tracking-wide text-mist";
export const btnGlass = `${btn} border border-white/15 bg-white/10 text-white hover:bg-white/15`;
export const glassPanel = "on-dark glass rounded-xl2 p-5 text-white sm:p-6";
