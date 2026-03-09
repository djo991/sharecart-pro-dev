import prisma from "../db.server";
import crypto from "crypto";

function generateShortToken(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    token += chars[bytes[i] % chars.length];
  }
  return token;
}

// ─── Create ─────────────────────────────────────────────────────────────────────

export async function createShareLink({
  shopDomain,
  items,
  customerId,
  customerEmail,
  expiresAt,
  name,
  description,
  neverExpires,
  isSaved,
  promoCodes,
}) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Error(`Shop not found: ${shopDomain}`);

  let token = null;
  for (let i = 0; i < 5; i++) {
    const candidate = generateShortToken();
    const existing = await prisma.shareLink.findUnique({ where: { token: candidate } });
    if (!existing) {
      token = candidate;
      break;
    }
  }

  if (!token) throw new Error("Could not generate a unique share token");

  return prisma.shareLink.create({
    data: {
      token,
      shopId: shop.id,
      cartData: JSON.stringify(items),
      customerId: customerId || null,
      customerEmail: customerEmail || null,
      expiresAt: neverExpires ? null : expiresAt || null,
      name: name || "",
      description: description || "",
      neverExpires: neverExpires || false,
      isSaved: isSaved !== undefined ? isSaved : true,
      ...(promoCodes && promoCodes.length > 0
        ? {
          promoCodes: {
            create: promoCodes.map((code) => ({ code })),
          },
        }
        : {}),
    },
    include: { promoCodes: true },
  });
}

// ─── Resolve (storefront link click) ────────────────────────────────────────────

export async function resolveShareLink(token) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { promoCodes: true },
  });
  if (!link) return null;

  // Archived or deactivated links are treated as invalid
  if (link.isArchived || !link.isActive) {
    return { expired: true };
  }

  if (!link.neverExpires && link.expiresAt && new Date() > link.expiresAt) {
    return { expired: true };
  }

  // Increment impressions
  await prisma.shareLink.update({
    where: { id: link.id },
    data: { impressions: { increment: 1 } },
  });

  let items = [];
  try {
    items = JSON.parse(link.cartData || "[]");
  } catch (e) {
    console.error("[ShareCart] Failed to parse cartData for token", token, e);
  }

  return {
    expired: false,
    items,
    shareLinkId: link.id,
    shopId: link.shopId,
    promoCodes: link.promoCodes.map((p) => p.code),
  };
}

// ─── Read (admin: shop-level) ───────────────────────────────────────────────────

export async function getShareLinksForShop(shopDomain, { skip = 0, take = 50 } = {}) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return [];

  return prisma.shareLink.findMany({
    where: { shopId: shop.id, isArchived: false },
    orderBy: { createdAt: "desc" },
    skip,
    take,
    include: { _count: { select: { events: true } } },
  });
}

// ─── Read (customer-level, for My Account page) ────────────────────────────────

export async function getShareLinksForCustomer(
  shopDomain,
  customerId,
  { page = 1, perPage = 25, includeExpired = false } = {}
) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return { items: [], total: 0, page, perPage };

  const where = {
    shopId: shop.id,
    customerId,
    isArchived: false,
    isSaved: true,
  };

  if (!includeExpired) {
    where.OR = [
      { neverExpires: true },
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ];
    // Do NOT filter by isActive here — paused carts should remain visible
    // in the customer account page so they can be resumed.
  }

  const [items, total] = await Promise.all([
    prisma.shareLink.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        promoCodes: true,
        orders: { orderBy: { createdAt: "desc" } },
        _count: { select: { events: true, orders: true } },
      },
    }),
    prisma.shareLink.count({ where }),
  ]);

  return { items, total, page, perPage };
}

// ─── Read single (with full details) ────────────────────────────────────────────

export async function getShareLinkById(id, customerId) {
  const link = await prisma.shareLink.findUnique({
    where: { id },
    include: {
      promoCodes: true,
      orders: { orderBy: { createdAt: "desc" } },
      _count: { select: { events: true, orders: true } },
    },
  });

  if (!link || link.isArchived) return null;
  if (customerId && link.customerId !== customerId) return null;

  return link;
}

// ─── Update ─────────────────────────────────────────────────────────────────────

export async function updateShareLink(id, customerId, updates) {
  const link = await prisma.shareLink.findUnique({ where: { id } });
  if (!link || link.isArchived) return null;
  if (customerId && link.customerId !== customerId) return null;

  const data = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.items !== undefined) data.cartData = JSON.stringify(updates.items);
  if (updates.neverExpires !== undefined) {
    data.neverExpires = updates.neverExpires;
    if (updates.neverExpires) data.expiresAt = null;
  }
  if (updates.expiresAt !== undefined && !updates.neverExpires) {
    data.expiresAt = updates.expiresAt;
  }

  // Replace promo codes if provided
  if (updates.promoCodes !== undefined) {
    await prisma.promoCode.deleteMany({ where: { shareLinkId: id } });
    if (updates.promoCodes.length > 0) {
      await prisma.promoCode.createMany({
        data: updates.promoCodes.map((code) => ({ code, shareLinkId: id })),
      });
    }
  }

  return prisma.shareLink.update({
    where: { id },
    data,
    include: { promoCodes: true },
  });
}

// ─── Toggle active/inactive ────────────────────────────────────────────────────

export async function toggleShareLink(id, customerId) {
  const link = await prisma.shareLink.findUnique({ where: { id } });
  if (!link || link.isArchived) return null;
  if (customerId && link.customerId !== customerId) return null;

  return prisma.shareLink.update({
    where: { id },
    data: { isActive: !link.isActive },
  });
}

// ─── Soft delete (archive) ──────────────────────────────────────────────────────

export async function archiveShareLink(id, customerId) {
  const link = await prisma.shareLink.findUnique({ where: { id } });
  if (!link) return null;
  if (customerId && link.customerId !== customerId) return null;

  return prisma.shareLink.update({
    where: { id },
    data: { isArchived: true, isActive: false },
  });
}

// ─── Save/unsave (visibility on account page) ──────────────────────────────────

export async function toggleSaveShareLink(id, customerId) {
  const link = await prisma.shareLink.findUnique({ where: { id } });
  if (!link || link.isArchived) return null;
  if (customerId && link.customerId !== customerId) return null;

  return prisma.shareLink.update({
    where: { id },
    data: { isSaved: !link.isSaved },
  });
}

// ─── Increment completed purchases (called from order webhook) ─────────────────

export async function incrementPurchases(id) {
  return prisma.shareLink.update({
    where: { id },
    data: { completedPurchases: { increment: 1 } },
  });
}

// ─── Destroy (admin: hard-delete) ──────────────────────────────────────────────

export async function deleteShareLink(id) {
  // Hard delete: requires clearing related share events and promo codes 
  // safely within a transaction because schema.prisma does not use `onDelete: Cascade`.
  return prisma.$transaction([
    prisma.shareEvent.deleteMany({ where: { shareLinkId: id } }),
    prisma.promoCode.deleteMany({ where: { shareLinkId: id } }),
    prisma.shareLink.delete({ where: { id } }),
  ]);
}
