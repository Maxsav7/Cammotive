import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Site from "../Site";

const pages = ["mobile-detailing", "ceramic-coating", "paint-correction", "locations", "stone-oak", "alamo-heights", "the-dominion", "leon-springs", "downtown", "our-work", "reviews", "contact", "about", "book", "appointment", "quote", "manage", "admin"];

// Cam's private booking page and the customer's appointment page are never indexed.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return slug === "manage" || slug === "appointment" || slug === "admin" ? { robots: { index: false, follow: false } } : {};
}

export default async function DetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!pages.includes(slug)) notFound();
  return <Site page={slug} />;
}
