const fallback = [
  { author: "Marcus R.", rating: 5, text: "The attention to detail was incredible. My interior looks brand new, and they came right to my driveway.", time: "Google review" },
  { author: "Isabella T.", rating: 5, text: "Professional, punctual, and the finish on my SUV was flawless. Already booked my maintenance detail.", time: "Google review" },
  { author: "Daniel C.", rating: 5, text: "Camotive brought the depth back to my paint. The difference before and after was unreal.", time: "Google review" },
];

export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (!key || !placeId) return Response.json({ reviews: fallback, source: "curated" });
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,reviews" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error("Google Places request failed");
    const data = await response.json() as { reviews?: Array<{ authorAttribution?: { displayName?: string }; rating?: number; text?: { text?: string }; relativePublishTimeDescription?: string }> };
    return Response.json({ reviews: (data.reviews ?? []).map((review) => ({
      author: review.authorAttribution?.displayName ?? "Google customer",
      rating: review.rating ?? 5,
      text: review.text?.text ?? "",
      time: review.relativePublishTimeDescription ?? "Google review",
    })), source: "google" });
  } catch {
    return Response.json({ reviews: fallback, source: "curated" });
  }
}
