import { authenticate, unauthenticated } from "../shopify.server";
import { getShareLinksForCustomer } from "../models/shareLink.server";
import { corsJson, corsOptions } from "../utils/customerCors";

// OPTIONS preflight — must respond before any authentication
export const action = async ({ request }) => {
  if (request.method === "OPTIONS") return corsOptions(request);
  return corsJson(request, { error: "Method not allowed" }, 405);
};

/**
 * Enrich items that are missing titles (legacy records stored before the
 * sharecart-button.js fix) by querying the Shopify Admin API for variant info.
 * Uses unauthenticated.admin which loads the stored offline session for the shop.
 * Best-effort — items fall back to showing the variantId if this fails.
 */
async function enrichItemTitles(shopDomain, shareCarts) {
  // Collect variant IDs that have no title
  const allItems = shareCarts.flatMap((c) => c.items);
  const needsEnrichment = allItems.some((item) => !item.title || !item.image);
  if (!needsEnrichment) return;

  try {
    const { admin } = await unauthenticated.admin(shopDomain);

    const variantIds = [
      ...new Set(
        allItems
          .filter((i) => (!i.title || !i.image) && i.variantId)
          .map((i) => `gid://shopify/ProductVariant/${i.variantId}`)
      ),
    ];
    if (variantIds.length === 0) return;

    const resp = await admin.graphql(
      `query EnrichVariants($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            title
            image { url }
            product {
              title 
              handle
              featuredImage { url }
            }
          }
        }
      }`,
      { variables: { ids: variantIds } }
    );
    const data = await resp.json(); // admin.graphql() returns a Response

    const variantMap = {};
    (data?.data?.nodes || []).forEach((node) => {
      if (!node?.id) return;
      const numId = node.id.split("/").pop();
      variantMap[numId] = {
        title: node.product?.title || "",
        variantTitle: node.title === "Default Title" ? "" : node.title || "",
        handle: node.product?.handle || "",
        image: node.image?.url || node.product?.featuredImage?.url || "",
      };
    });

    // Mutate items in-place
    shareCarts.forEach((cart) => {
      cart.items.forEach((item) => {
        if (variantMap[String(item.variantId)]) {
          const v = variantMap[String(item.variantId)];
          if (!item.title) {
            item.title = v.title;
            item.variantTitle = v.variantTitle;
            item.handle = v.handle;
          }
          if (!item.image && v.image) {
            item.image = v.image;
          }
        }
      });
    });
  } catch (e) {
    // Enrichment is best-effort — items still display with variantId fallback
    console.warn("[ShareCart] variant title enrichment failed:", e?.message);
  }
}

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") return corsOptions(request);

  try {
    // Wrap auth so failures still return CORS-decorated responses the extension can read
    let sessionToken;
    try {
      ({ sessionToken } = await authenticate.public.customerAccount(request));
    } catch (err) {
      return corsJson(request, { error: "Unauthorized" }, 401);
    }

    // dest can arrive as "sharecartpro.myshopify.com" (no protocol) or "https://..."
    const dest = sessionToken?.dest || "";
    const shopDomain = dest.includes("://") ? new URL(dest).hostname : dest;

    // sessionToken.sub is a GID: "gid://shopify/Customer/12345"
    // The DB stores the plain numeric ID from Liquid's {{ customer.id }} — strip the prefix.
    const rawSub = sessionToken?.sub || "";
    const customerId = rawSub.startsWith("gid://") ? rawSub.split("/").pop() : rawSub;

    if (!shopDomain || !customerId) {
      return corsJson(request, { error: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const perPage = parseInt(url.searchParams.get("perPage") || "10", 10);
    const includeExpired = url.searchParams.get("includeExpired") === "true";

    const result = await getShareLinksForCustomer(shopDomain, customerId, {
      page,
      perPage,
      includeExpired,
    });

    const shareCarts = (result.items || []).map((link) => {
      let items = [];
      try {
        items = JSON.parse(link.cartData || "[]");
      } catch (e) { }

      return {
        id: link.id,
        token: link.token,
        name: link.name || "",
        description: link.description || "",
        shareUrl: `https://${shopDomain}/?_sc=${link.token}`,
        isActive: link.isActive,
        isSaved: link.isSaved,
        neverExpires: link.neverExpires,
        impressions: link.impressions,
        completedPurchases: link.completedPurchases,
        expiresAt: link.expiresAt,
        createdAt: link.createdAt,
        items,
        promoCodes: link.promoCodes || [],
      };
    });

    // Enrich legacy items that were saved before title capture was added
    await enrichItemTitles(shopDomain, shareCarts);

    const totalPages = Math.ceil((result.total || 0) / perPage) || 1;
    return corsJson(request, {
      shareCarts,
      total: result.total || 0,
      page: result.page || page,
      totalPages,
    });
  } catch (err) {
    // Catch-all: ensure any unexpected crash still returns CORS headers
    console.error("[ShareCart] api.customer.share-carts loader error:", err?.message ?? err);
    return corsJson(request, { error: "Internal server error" }, 500);
  }
};
