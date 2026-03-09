import { authenticate } from "../shopify.server";
import { toggleShareLink } from "../models/shareLink.server";

function getCorsHeaders(request) {
  const origin = request.headers?.get('Origin') || request.headers?.get('origin') || '';
  const allowed = (
    origin.endsWith('.myshopify.com') ||
    origin.endsWith('.shopify.com') ||
    origin === 'https://extensions.shopifycdn.com'
  ) ? origin : 'https://extensions.shopifycdn.com';

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function corsJson(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...getCorsHeaders(request) },
  });
}

export const action = async ({ request, params }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }

  try {
    let sessionToken;
    try {
      ({ sessionToken } = await authenticate.public.customerAccount(request));
    } catch (err) {
      return corsJson(request, { error: "Unauthorized" }, 401);
    }

    // sessionToken.sub is a GID: "gid://shopify/Customer/12345" — DB stores plain numeric ID
    const rawSub = sessionToken?.sub || "";
    const customerId = rawSub.startsWith("gid://") ? rawSub.split("/").pop() : rawSub;

    if (!customerId) {
      return corsJson(request, { error: "Unauthorized" }, 401);
    }

    const { id } = params;
    const result = await toggleShareLink(id, customerId);

    if (!result) {
      return corsJson(request, { error: "Not found or access denied" }, 404);
    }

    return corsJson(request, { success: true, isActive: result.isActive });
  } catch (err) {
    console.error(
      "[ShareCart] api.customer.share-carts.$id.toggle action error:",
      err?.message ?? err
    );
    return corsJson(request, { error: "Internal server error" }, 500);
  }
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }
  return corsJson(request, { error: "Method not allowed" }, 405);
};
