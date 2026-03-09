import prisma from "../db.server";

export async function createOrder({
  shareLinkId,
  shopifyOrderId,
  shopifyOrderName,
  shopifyCustomerId,
  shopifyCustomerEmail,
  orderValue,
}) {
  return prisma.order.create({
    data: {
      shareLinkId,
      shopifyOrderId: String(shopifyOrderId),
      shopifyOrderName: shopifyOrderName || null,
      shopifyCustomerId: shopifyCustomerId ? String(shopifyCustomerId) : null,
      shopifyCustomerEmail: shopifyCustomerEmail || null,
      orderValue: orderValue ? parseFloat(orderValue) : null,
    },
  });
}

export async function getOrdersForShareLink(shareLinkId) {
  return prisma.order.findMany({
    where: { shareLinkId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrderById(id, shopifyCustomerId) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { shareLink: true },
  });
  if (!order) return null;
  if (shopifyCustomerId && order.shopifyCustomerId !== shopifyCustomerId) return null;
  return order;
}

export async function getOrderByShopifyId(shopifyOrderId, shopifyCustomerId) {
  const order = await prisma.order.findFirst({
    where: { shopifyOrderId: String(shopifyOrderId) },
    include: { shareLink: true },
  });
  if (!order) return null;
  if (shopifyCustomerId && order.shopifyCustomerId !== shopifyCustomerId) return null;
  return order;
}
