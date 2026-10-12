// Ratings link directly to Google; no public endpoint should trigger paid Places calls.
export async function GET() {
  return Response.json({ source: "profile", profileUrl: "https://www.google.com/search?q=camotive+detailing+san+antonio&ludocid=11765857279964552273" }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
