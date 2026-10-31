
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import ModeBanner from "@/components/ModeBanner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.babride.bond"),
  title: "Bab Ride | Campus Tricycle Rides",
  description:
    "Book campus tricycle rides at a fixed ₦200 fare. Built for Babcock University. Not affiliated with or endorsed by the university.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#071A3D",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <ModeBanner />
        <SiteHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
