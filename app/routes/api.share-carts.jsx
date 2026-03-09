import { getShareLinksForCustomer } from "../models/shareLink.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(request.url);
    const shopDomain = url.searchParams.get("shop");
    const customerId = url.searchParams.get("customerId");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const perPage = parseInt(url.searchParams.get("perPage") || "25", 10);
    const includeExpired = url.searchParams.get("includeExpired") === "true";

    if (!shopDomain || !customerId) {
      return Response.json(
        { error: "Missing required params: shop, customerId" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const result = await getShareLinksForCustomer(shopDomain, customerId, {
      page,
      perPage,
      includeExpired,
    });

    // Serialize cart data for each item
    const items = result.items.map((link) => ({
      id: link.id,
      token: link.token,
      name: link.name,
      description: link.description,
      items: JSON.parse(link.cartData),
      isActive: link.isActive,
      isSaved: link.isSaved,
      neverExpires: link.neverExpires,
      impressions: link.impressions,
      completedPurchases: link.completedPurchases,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      promoCodes: link.promoCodes.map((p) => p.code),
      orders: link.orders,
      eventCount: link._count.events,
      orderCount: link._count.orders,
    }));

    return Response.json(
      { items, total: result.total, page: result.page, perPage: result.perPage },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[/api/share-carts] Error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
