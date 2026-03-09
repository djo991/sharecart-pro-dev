import prisma from "../db.server";

/**
 * Find or create a Shop record when a store installs or opens the app.
 */
export async function findOrCreateShop(shopDomain) {
  let shop = await prisma.shop.findUnique({ where: { shopDomain } });

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        shopDomain,
        settings: {
          create: {}, // creates ShopSettings with all defaults
        },
      },
      include: { settings: true },
    });
  }

  return shop;
}

export async function getShop(shopDomain) {
  return prisma.shop.findUnique({
    where: { shopDomain },
    include: { settings: true },
  });
}

export async function updateShopSettings(shopDomain, data) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Error(`Shop not found: ${shopDomain}`);

  return prisma.shopSettings.upsert({
    where: { shopId: shop.id },
    update: data,
    create: { shopId: shop.id, ...data },
  });
}
