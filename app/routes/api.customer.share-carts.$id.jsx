import { authenticate } from "../shopify.server";
import { getShareLinkById, archiveShareLink } from "../models/shareLink.server";
import { corsJson, corsOptions } from "../utils/customerCors";

export const loader = async ({ request, params }) => {
  if (request.method === "OPTIONS") {
    return corsOptions(request);
  }

  try {
    let sessionToken;
    try {
      ({ sessionToken } = await authenticate.public.customerAccount(request));
    } catch (err) {
      return corsJson(request, { error: "Unauthorized" }, 401);
    }

    const dest = sessionToken?.dest || "";
    const shopDomain = dest.includes("://") ? new URL(dest).hostname : dest;

    // sessionToken.sub is a GID: "gid://shopify/Customer/12345" — DB stores plain numeric ID
    const rawSub = sessionToken?.sub || "";
    const customerId = rawSub.startsWith("gid://") ? rawSub.split("/").pop() : rawSub;

    if (!customerId) {
      return corsJson(request, { error: "Unauthorized" }, 401);
    }

    const { id } = params;
    const link = await getShareLinkById(id, customerId);

    if (!link) {
      return corsJson(request, { error: "Not found" }, 404);
    }

    let items = [];
    try {
      items = JSON.parse(link.cartData || "[]");
    } catch (e) { }

    return corsJson(request, {
      id: link.id,
      token: link.token,
      name: link.name || "",
      description: link.description || "",
      shareUrl: `https://${shopDomain}/?_sc=${link.token}`,
      isActive: link.isActive,
      isSaved: link.isSaved,
      impressions: link.impressions,
      completedPurchases: link.completedPurchases,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      items,
      promoCodes: link.promoCodes || [],
      orders: (link.orders || []).map((o) => ({
        id: o.id,
        shopifyOrderId: o.shopifyOrderId,
        shopifyOrderName: o.shopifyOrderName,
        orderValue: o.orderValue,
        createdAt: o.createdAt,
      })),
    });
  } catch (err) {
    console.error("[ShareCart] api.customer.share-carts.$id loader error:", err?.message ?? err);
    return corsJson(request, { error: "Internal server error" }, 500);
  }
};

export const action = async ({ request, params }) => {
  if (request.method === "OPTIONS") {
    return corsOptions(request);
  }
  if (request.method !== "DELETE") {
    return corsJson(request, { error: "Method not allowed" }, 405);
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
    const deleted = await archiveShareLink(id, customerId);
    if (!deleted) {
      return corsJson(request, { error: "Not found or access denied" }, 404);
    }

    return corsJson(request, { success: true });
  } catch (err) {
    console.error("[ShareCart] api.customer.share-carts.$id action error:", err?.message ?? err);
    return corsJson(request, { error: "Internal server error" }, 500);
  }
};
