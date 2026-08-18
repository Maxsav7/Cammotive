type GoogleReview = {
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  rating?: number;
  text?: { text?: string };
  relativePublishTimeDescription?: string;
  googleMapsUri?: string;
};

type GooglePlace = {
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  reviews?: GoogleReview[];
  googleMapsUri?: string;
};

const googleProfileUrl = "https://www.google.com/search?q=camotive+detailing+san+antonio&ludocid=11765857279964552273";

function normalizePlace(place: GooglePlace) {
  return {
    businessName: place.displayName?.text ?? "Camotive Detailing",
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
    profileUrl: place.googleMapsUri ?? googleProfileUrl,
    reviews: (place.reviews ?? []).map((review) => ({
      author: review.authorAttribution?.displayName ?? "Google reviewer",
      authorUrl: review.authorAttribution?.uri ?? null,
      authorPhoto: review.authorAttribution?.photoUri ?? null,
      rating: review.rating ?? 5,
      text: review.text?.text ?? "",
      time: review.relativePublishTimeDescription ?? "Google review",
      reviewUrl: review.googleMapsUri ?? place.googleMapsUri ?? googleProfileUrl,
    })).filter((review) => review.text),
  };
}

export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (!key) return Response.json({ source: "unconfigured", profileUrl: googleProfileUrl });

  try {
    let place: GooglePlace;
    if (placeId) {
      const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "displayName,rating,userRatingCount,reviews,googleMapsUri" },
        next: { revalidate: 3600 },
      });
      if (!response.ok) throw new Error("Google Place Details request failed");
      place = await response.json() as GooglePlace;
    } else {
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.reviews,places.googleMapsUri" },
        body: JSON.stringify({ textQuery: "Camotive Detailing San Antonio Texas", maxResultCount: 1 }),
        next: { revalidate: 86400 },
      });
      if (!response.ok) throw new Error("Google Text Search request failed");
      const data = await response.json() as { places?: GooglePlace[] };
      if (!data.places?.[0]) throw new Error("Camotive Google profile was not found");
      place = data.places[0];
    }
    return Response.json({ source: "google", ...normalizePlace(place) });
  } catch {
    return Response.json({ source: "error", profileUrl: googleProfileUrl }, { status: 502 });
  }
}
