import { notFound } from "next/navigation";
import Site from "../Site";

const pages = ["mobile-detailing", "ceramic-coating", "paint-correction", "locations", "stone-oak", "alamo-heights", "the-dominion", "leon-springs", "downtown", "our-work", "reviews", "contact", "book", "appointment"];

export default async function DetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!pages.includes(slug)) notFound();
  return <Site page={slug} />;
}
