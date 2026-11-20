import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camotive Detailing | Premium Mobile Detailing in San Antonio",
  description: "Schedule convenient mobile detailing and paint protection in Stone Oak, Alamo Heights, The Dominion, Leon Springs, Downtown, and across San Antonio.",
  metadataBase: new URL("https://www.camotivedetailing.com"),
  openGraph: {
    title: "Camotive Detailing",
    description: "Premium mobile detailing in San Antonio. Clean cars get attention.",
  },
  twitter: { card: "summary" },
};

export const viewport: Viewport = { themeColor: "#121117" };

// Every page is rendered per request, so each gets a fresh script nonce (see proxy.ts).
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return <html lang="en"><head><link rel="preload" href="/fonts/archivo-wdth.woff2" as="font" type="font/woff2" crossOrigin="" /></head><body>{children}</body></html>;
}
