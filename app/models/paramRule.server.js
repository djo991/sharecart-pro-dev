import prisma from "../db.server";

/**
 * Get all param rules for a shop (active + inactive).
 */
export async function getAllParamRules(shopDomain) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return [];

  return prisma.paramRule.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Get only active param rules for a shop (used during link generation).
 */
export async function getParamRules(shopDomain) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return [];

  return prisma.paramRule.findMany({
    where: { shopId: shop.id, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Create a new param rule for a shop.
 */
export async function createParamRule(shopDomain, { paramKey, paramValue, channelOverrides }) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Error(`Shop not found: ${shopDomain}`);

  return prisma.paramRule.create({
    data: {
      shopId: shop.id,
      paramKey,
      paramValue,
      channelOverrides: channelOverrides ? JSON.stringify(channelOverrides) : null,
    },
  });
}

/**
 * Update a param rule (toggle active, edit values, etc.).
 */
export async function updateParamRule(id, data) {
  const updateData = { ...data };
  if (updateData.channelOverrides !== undefined) {
    updateData.channelOverrides = updateData.channelOverrides
      ? JSON.stringify(updateData.channelOverrides)
      : null;
  }

  return prisma.paramRule.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Delete a param rule.
 */
export async function deleteParamRule(id) {
  return prisma.paramRule.delete({ where: { id } });
}

/**
 * Build a URL query string from active rules, resolving dynamic tokens.
 *
 * Context object:
 *   { customerId, customerEmail, channel, shareDate }
 *
 * Returns a string like "&utm_source=sharecart&utm_medium=whatsapp&ref=cust_123"
 * (leading & so it can be appended directly to a URL that already has ?_sc=TOKEN).
 */
export function buildParamString(rules, context = {}) {
  if (!rules || rules.length === 0) return "";

  const pairs = rules.map((rule) => {
    let value = rule.paramValue;

    // Check for channel overrides first
    if (rule.channelOverrides && context.channel) {
      try {
        const overrides =
          typeof rule.channelOverrides === "string"
            ? JSON.parse(rule.channelOverrides)
            : rule.channelOverrides;
        if (overrides[context.channel]) {
          value = overrides[context.channel];
        }
      } catch {
        // ignore parse errors, fall through to default value
      }
    }

    // Replace standard tokens
    value = value
      .replace("{customer_id}", context.customerId || "")
      .replace("{customer_email}", context.customerEmail || "")
      .replace("{share_date}", context.shareDate || new Date().toISOString().split("T")[0])
      .replace("{channel}", context.channel || "link");

    // Replace dynamic tokens injected via customContext
    value = value.replace(/\{([^}]+)\}/g, (match, key) => {
      if (context[key] !== undefined) {
        return context[key];
      }
      return match;
    });

    return `${encodeURIComponent(rule.paramKey)}=${encodeURIComponent(value)}`;
  });

  return "&" + pairs.join("&");
}
