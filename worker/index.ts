/** Cloudflare Worker entry point: the vinext app, security headers and the booking cron. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { securityHeaders } from "../lib/security-headers";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  // Only needed for next/image, which the site doesn't use; no binding is configured.
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // The bare domain redirects to www (as it does on Vercel), so bookings always
    // come from the one origin the booking API accepts.
    if (url.hostname === "camotivedetailing.com") {
      url.hostname = "www.camotivedetailing.com";
      return Response.redirect(url.toString(), 308);
    }

    if (url.pathname === "/_vinext/image") {
      if (!env.IMAGES) return new Response("Not found", { status: 404 });
      const images = env.IMAGES;
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await images.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    const secured = new Response(response.body, response);
    for (const [key, value] of Object.entries(securityHeaders)) secured.headers.set(key, value);
    return secured;
  },

  // Cron trigger (wrangler.jsonc): runs booking maintenance (retry emails and
  // calendar changes, queue reminders, purge expired data) through the same
  // authenticated endpoint Vercel Cron used.
  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    const origin = process.env.BOOKING_ORIGIN, secret = process.env.BOOKING_CRON_SECRET;
    if (process.env.BOOKING_ENABLED !== "true" || !origin || !secret) return;
    const response = await worker.fetch(new Request(`${origin}/api/internal/booking-maintenance`, {
      method: "POST", headers: { authorization: `Bearer ${secret}` },
    }), env, ctx);
    if (!response.ok) console.error(`booking_maintenance_failed status=${response.status}`);
  },
};

export default worker;
