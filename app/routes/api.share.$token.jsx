import { resolveShareLink } from "../models/shareLink.server";
import { logEvent } from "../models/shareEvent.server";
import prisma from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request, params }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  const { token } = params;

  if (!token) {
    return Response.json({ error: "Missing token" }, { status: 400, headers: CORS_HEADERS });
  }

  const result = await resolveShareLink(token);

  if (!result) {
    return Response.json({ error: "Share link not found" }, { status: 404, headers: CORS_HEADERS });
  }

  if (result.expired) {
    return Response.json({ expired: true, items: [] }, { headers: CORS_HEADERS });
  }

  // Look up shop domain and settings
  const shop = await prisma.shop.findUnique({
    where: { id: result.shopId },
    include: { settings: true }
  });
  if (shop) {
    // Get channel from the original creation event
    const creationEvent = await prisma.shareEvent.findFirst({
      where: { shareLinkId: result.shareLinkId, eventType: "created" },
      orderBy: { createdAt: "desc" },
    });

    await logEvent({
      shopDomain: shop.shopDomain,
      shareLinkId: result.shareLinkId,
      eventType: "opened",
      channel: creationEvent?.channel || null,
    });

    // --- Retroactive Product Exclusion Enforcement ---
    // If a merchant tags a product as excluded AFTER a link was created, we shouldn't unpack it.
    if (shop.settings?.excludeTag && result.items.length > 0) {
      try {
        const { admin } = await unauthenticated.admin(shop.shopDomain);
        const excludeTagLower = shop.settings.excludeTag.toLowerCase();

        const variantIds = result.items.map(i => `gid://shopify/ProductVariant/${i.variantId}`);
        const response = await admin.graphql(`
          query getVariantTags($ids: [ID!]!) {
            nodes(ids: $ids) {
              ... on ProductVariant {
                id
                product {
                  tags
                }
              }
            }
          }
        `, {
          variables: { ids: variantIds }
        });

        const data = await response.json();
        const nodes = data?.data?.nodes || [];
        const excludedVariantGids = new Set();

        nodes.forEach(node => {
          if (node && node.product && node.product.tags) {
            const hasExcludeTag = node.product.tags.some(t => t.toLowerCase() === excludeTagLower);
            if (hasExcludeTag) {
              excludedVariantGids.add(node.id);
            }
          }
        });

        result.items = result.items.filter(i => !excludedVariantGids.has(`gid://shopify/ProductVariant/${i.variantId}`));
      } catch (err) {
        console.error("[/api/share/$token] Error enforcing retroactive exclusions:", err);
      }
    }
  }

  // Include promo codes so restore.js can store them as cart attributes
  const promoCodes = (result.promoCodes || []).map((pc) => pc.code);

  return Response.json(
    { expired: false, items: result.items, promoCodes },
    { headers: CORS_HEADERS }
  );
};
