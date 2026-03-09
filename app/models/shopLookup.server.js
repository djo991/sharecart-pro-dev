import prisma from "../db.server";

// Simple in-memory cache for the current request context or short-lived caching
const shopCache = new Map();

/**
 * Gets a shop by domain, caching the result to avoid repeated DB hits.
 * We cache the shop object with an expiry to ensure it's fresh but efficient
 * for bursts of calls (e.g., during webhooks or app proxy requests).
 */
export async function getCachedShop(shopDomain) {
    if (!shopDomain) return null;

    const now = Date.now();
    const cached = shopCache.get(shopDomain);

    // Cache hit, valid for 5 minutes
    if (cached && (now - cached.timestamp < 5 * 60 * 1000)) {
        return cached.shop;
    }

    // Cache miss, fetch from DB
    const shop = await prisma.shop.findUnique({
        where: { shopDomain },
        include: { settings: true }
    });

    if (shop) {
        shopCache.set(shopDomain, { shop, timestamp: now });
    } else {
        // Cache the null result for 1 minute to prevent hammering the DB for invalid shops
        shopCache.set(shopDomain, { shop: null, timestamp: now });
    }

    return shop;
}
