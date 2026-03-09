import { createShareLink } from "../models/shareLink.server";
import { getParamRules, buildParamString } from "../models/paramRule.server";
import { getCachedShop } from "../models/shopLookup.server";
import { logEvent } from "../models/shareEvent.server";
import { authenticate, unauthenticated } from "../shopify.server";

// Allow storefront JS + App Proxy to call this endpoint
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }) => {
  console.debug("[/api/share] loader hit — method:", request.method, "url:", request.url);
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
};

export const action = async ({ request }) => {
  console.debug("[/api/share] action hit — method:", request.method, "url:", request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { session } = await authenticate.public.appProxy(request);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }
    const shopDomain = session.shop;

    const body = await request.json();
    console.debug("[/api/share] body:", JSON.stringify(body));
    const {
      customerId,
      customerEmail,
      channel,
      name,
      description,
      promoCode,
      expiryDays,
      neverExpires,
      save,
      currentParams,
      customContext,
    } = body;
    let items = body.items;

    if (!items || !Array.isArray(items) || items.length === 0) {
      console.warn("[/api/share] 400 — missing fields");
      return Response.json({ error: "Missing required fields: items" }, {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    // Validate item structure
    for (const item of items) {
      if (!item.variantId || !item.quantity || item.quantity <= 0) {
        return Response.json({ error: "Invalid item: variantId required and quantity must be > 0" }, { status: 400, headers: CORS_HEADERS });
      }
    }

    // Validate string lengths
    if (name && name.length > 255) return Response.json({ error: "Name too long" }, { status: 400, headers: CORS_HEADERS });
    if (description && description.length > 1000) return Response.json({ error: "Description too long" }, { status: 400, headers: CORS_HEADERS });
    if (promoCode && promoCode.length > 100) return Response.json({ error: "Promo code too long" }, { status: 400, headers: CORS_HEADERS });

    // Validate expiryDays
    if (expiryDays !== undefined && (typeof expiryDays !== 'number' || expiryDays < 1 || expiryDays > 365)) {
      return Response.json({ error: "Invalid expiryDays: must be between 1 and 365" }, { status: 400, headers: CORS_HEADERS });
    }

    // Validate shop exists
    const shop = await getCachedShop(shopDomain);
    console.debug("[/api/share] shop lookup:", shop ? "found" : "NOT FOUND");
    if (!shop) {
      return Response.json({ error: "Shop not found" }, { status: 404, headers: CORS_HEADERS });
    }

    // --- 1. Product Exclusion Enforcement ---
    if (shop.settings?.excludeTag) {
      try {
        const { admin } = await unauthenticated.admin(shopDomain);
        const excludeTagLower = shop.settings.excludeTag.toLowerCase();

        // Chunk variant ids to max 250 (GraphQL limit for nodes), realistically carts have < 50 items
        const variantIds = items.map(i => `gid://shopify/ProductVariant/${i.variantId}`);

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
        console.log("[/api/share] GraphQL Exclusions Response:", JSON.stringify(data, null, 2));
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

        items = items.filter(i => !excludedVariantGids.has(`gid://shopify/ProductVariant/${i.variantId}`));

        if (items.length === 0) {
          return Response.json({ error: "All items in the cart are excluded from sharing." }, { headers: CORS_HEADERS });
        }
      } catch (err) {
        console.error("[/api/share] Error enforcing exclusions:", err);
      }
    }

    // Compute expiry: per-cart expiryDays overrides global setting
    let expiresAt = null;
    const isNeverExpires = neverExpires === true;
    if (!isNeverExpires) {
      const days = expiryDays || shop.settings?.linkExpireDays;
      if (days) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
      }
    }

    // Build promo codes array
    const promoCodes = promoCode ? [promoCode] : [];

    // Create the share link record
    const shareLink = await createShareLink({
      shopDomain,
      items,
      customerId: customerId || null,
      customerEmail: customerEmail || null,
      expiresAt,
      name: name || "",
      description: description || "",
      neverExpires: isNeverExpires,
      isSaved: save !== false,
      promoCodes,
    });
    console.debug("[/api/share] shareLink created:", shareLink.token);

    // Build URL params from merchant's rules
    const rules = await getParamRules(shopDomain);
    let paramString = buildParamString(rules, {
      customerId,
      customerEmail,
      channel: channel || "link",
      shareDate: new Date().toISOString().split("T")[0],
      ...customContext // spread dynamic liquid context
    });

    // Append preserved params
    if (shop.settings?.preserveShareParams && currentParams) {
      // Remove leading ? if exists
      const cleanedCurrent = currentParams.startsWith('?') ? currentParams.slice(1) : currentParams;
      if (cleanedCurrent) {
        paramString += `&${cleanedCurrent}`;
      }
    }

    // Final share URL
    // If promo code exists, use Shopify's /discount/CODE/ path for auto-apply
    let shareUrl;
    if (promoCodes.length > 0) {
      const code = encodeURIComponent(promoCodes[0]);
      const redirectPath = `/?_sc=${shareLink.token}${paramString}`;
      shareUrl = `https://${shopDomain}/discount/${code}?redirect=${encodeURIComponent(redirectPath)}`;
    } else {
      shareUrl = `https://${shopDomain}/?_sc=${shareLink.token}${paramString}`;
    }
    console.debug("[/api/share] ✅ shareUrl:", shareUrl);

    // Log the creation event
    await logEvent({
      shopDomain,
      shareLinkId: shareLink.id,
      eventType: "created",
      channel: channel || "link",
      customerId: customerId || null,
    });

    // Fire Custom Webhook
    if (shop.settings?.customWebhookUrl) {
      fetch(shop.settings.customWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "share_link_created",
          shop: shopDomain,
          token: shareLink.token,
          shareUrl,
          items,
          customerId,
          customerEmail,
          channel: channel || "link"
        })
      }).catch(err => console.error("[Webhook Error] Failed to post to custom webhook:", err));
    }

    return Response.json({ shareUrl, token: shareLink.token }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("[/api/share] Error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
};
