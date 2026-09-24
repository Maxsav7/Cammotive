import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camotive Detailing | Premium Mobile Detailing in San Antonio",
  description: "Schedule convenient mobile detailing and paint protection in Stone Oak, Alamo Heights, The Dominion, Leon Springs, Downtown, and across San Antonio.",
  metadataBase: new URL("https://camotive-detailing.sites.openai.com"),
  openGraph: {
    title: "Camotive Detailing",
    description: "Premium mobile detailing in San Antonio. Clean cars get attention.",
  },
  twitter: { card: "summary" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
