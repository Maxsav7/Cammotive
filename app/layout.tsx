import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camotive Detailing | Premium Mobile Detailing in San Antonio",
  description: "Schedule convenient mobile detailing and paint protection in Stone Oak, Alamo Heights, The Dominion, Leon Springs, Downtown, and across San Antonio.",
  metadataBase: new URL("https://camotive.vercel.app"),
  openGraph: {
    title: "Camotive Detailing",
    description: "Premium mobile detailing in San Antonio. Clean cars get attention.",
  },
  twitter: { card: "summary" },
};

export const viewport: Viewport = { themeColor: "#121117" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="preload" href="/fonts/archivo-wdth.woff2" as="font" type="font/woff2" crossOrigin="" /></head><body>{children}</body></html>;
}
