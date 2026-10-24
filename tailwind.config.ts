import type { Config } from "tailwindcss";
// Design tokens. Blue is dominant; gold (#DDBB62) is a small accent only.
// The "navy" scale keeps its old key names so existing pages inherit the new palette.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: {
      royal: "#245CE2",
      mist: "#B9C9E8",
      navy: { 950: "#071A3D", 900: "#0A2454", 800: "#17356F", 700: "#245CE2", 100: "#E3EBFA", 50: "#F5F8FF" },
      accent: { DEFAULT: "#DDBB62", dark: "#8A6A12" },
    },
    borderRadius: { xl2: "1.25rem" },
    fontFamily: { sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    boxShadow: { glass: "0 24px 60px -20px rgba(3,10,30,.65), inset 0 1px 0 rgba(255,255,255,.18)" },
  } },
  plugins: [],
};
export default config;
