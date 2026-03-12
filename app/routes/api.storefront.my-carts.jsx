import { authenticate } from "../shopify.server";
import { getShareLinksForCustomer } from "../models/shareLink.server";
import { getShop } from "../models/shop.server";

/**
 * App proxy endpoint: /apps/sharecart/api/storefront/my-carts
 * Returns the logged-in customer's saved share links for the account page.
 *
 * Shopify app proxy automatically appends ?shop=... and ?logged_in_customer_id=...
 * when the request comes from a logged-in customer on the storefront.
 */
export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);

  const customerId = url.searchParams.get("logged_in_customer_id");
  if (!customerId) {
    return Response.json({ shareCarts: [], total: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  // Read shop settings for customer permissions
  const shop = await getShop(session.shop);
  const s = shop?.settings || {};
  const includeExpired = s.showExpiredCarts === true;
  const allowCustomerDeactivate = s.allowCustomerDeactivate !== false;
  const allowCustomerDelete = s.allowCustomerDelete !== false;

  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const perPage = parseInt(url.searchParams.get("perPage") || "20", 10);

  const result = await getShareLinksForCustomer(session.shop, customerId, {
    page,
    perPage,
    includeExpired,
  });

  const shareCarts = result.items.map((link) => {
    let items = [];
    try { items = JSON.parse(link.cartData); } catch (_) {}
    return {
      id: link.id,
      token: link.token,
      name: link.name || "",
      description: link.description || "",
      isActive: link.isActive,
      isSaved: link.isSaved,
      neverExpires: link.neverExpires,
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
      createdAt: link.createdAt.toISOString(),
      impressions: link.impressions || 0,
      completedPurchases: link.completedPurchases || 0,
      items,
      promoCodes: (link.promoCodes || []).map((p) => ({ code: p.code })),
      orders: (link.orders || []).map((o) => ({
        id: o.id,
        shopifyOrderName: o.shopifyOrderName,
        shopifyOrderId: o.shopifyOrderId,
        orderValue: o.orderValue,
        createdAt: o.createdAt.toISOString(),
      })),
      shareUrl:
        "https://" +
        session.shop +
        "/?_sc=" +
        link.token,
    };
  });

  return Response.json(
    {
      shareCarts,
      total: result.total,
      page: result.page,
      totalPages: Math.ceil(result.total / perPage),
      // Customer permissions — consumed by sharecart-account.js
      allowCustomerDeactivate,
      allowCustomerDelete,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
};
