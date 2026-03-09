/**
 * Public bootstrap endpoint — called by the customer account UI extension
 * via the app proxy as a *simple* GET (no Authorization header, no preflight).
 *
 * The Shopify app proxy forwards the response — including our CORS headers —
 * back to the browser, so the extension JS can read the returned `apiUrl` and
 * then use that URL for subsequent authenticated direct-to-app calls (bypassing
 * the proxy, which redirects CORS preflight OPTIONS requests).
 *
 * Route: GET /apps/sharecart/api/storefront/bootstrap
 * (Proxy strips /apps/sharecart, so React Router sees /api/storefront/bootstrap)
 *
 * No authentication needed — the only data returned is the app's public URL.
 */
export const loader = async ({ request }) => {
  // Shopify CLI injects process.env.SHOPIFY_APP_URL at build/deploy time.
  // Fall back to reconstructing the origin from request headers.
  let apiUrl = process.env.SHOPIFY_APP_URL || "";

  if (!apiUrl) {
    const url = new URL(request.url);
    // Honour X-Forwarded-Proto / X-Forwarded-Host set by reverse proxies /
    // Cloudflare tunnels so the returned URL is the public-facing one.
    const proto =
      request.headers.get("x-forwarded-proto") ||
      url.protocol.replace(/:$/, "");
    const host =
      request.headers.get("x-forwarded-host") || url.host;
    apiUrl = `${proto}://${host}`;
  }

  apiUrl = apiUrl.replace(/\/+$/, "");

  return new Response(JSON.stringify({ apiUrl }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Must be present so the browser allows the extension to read the
      // response body (cross-origin simple GET from extensions.shopifycdn.com)
      "Access-Control-Allow-Origin": "*",
      // Safe to cache briefly — the app URL rarely changes
      "Cache-Control": "public, max-age=300",
    },
  });
};
