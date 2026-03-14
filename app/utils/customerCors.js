// Shared CORS helpers for Customer Account API routes.
// All customer account endpoints run outside the normal Shopify session context
// and need explicit CORS headers so the extension iframe can reach them.

const ALLOWED_ORIGINS = [".myshopify.com", ".shopify.com"];
const FALLBACK_ORIGIN = "https://extensions.shopifycdn.com";

function getAllowedOrigin(request) {
  const origin = request.headers?.get("Origin") || request.headers?.get("origin") || "";
  return (
    ALLOWED_ORIGINS.some((suffix) => origin.endsWith(suffix)) ||
    origin === FALLBACK_ORIGIN
  )
    ? origin
    : FALLBACK_ORIGIN;
}

export function corsHeaders(request) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(request),
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function corsJson(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

export function corsOptions(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
