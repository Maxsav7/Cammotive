import { NextResponse, type NextRequest } from "next/server";
import { newNonce, pageContentSecurityPolicy } from "./lib/security-headers";

// Gives every page request a fresh nonce and the content security policy that uses
// it. Next.js reads the nonce from the request's policy header and puts it on its
// own scripts, so only those run. Pages are rendered per request for this (see
// app/layout.tsx): a page built ahead of time couldn't carry a fresh nonce.
export function proxy(request: NextRequest) {
  const policy = pageContentSecurityPolicy(newNonce());
  const headers = new Headers(request.headers);
  headers.set("content-security-policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export const config = {
  matcher: [{
    // Not API routes, build files, or the images and fonts in public/; not link
    // prefetches (data, not pages). Kept simple enough for vinext's matcher safety check.
    source: "/((?!api/|_next/static|_next/image|brand/|work/|fonts/|[^/]+\\.(?:png|jpg|jpeg|webp|svg|ico|txt|xml)$).*)",
    missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
  }],
};
