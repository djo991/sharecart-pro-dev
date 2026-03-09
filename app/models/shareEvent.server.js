import prisma from "../db.server";

export async function logEvent({ shopDomain, shareLinkId, eventType, channel, customerId, orderId, orderValue, ipCountry }) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return null;

  return prisma.shareEvent.create({
    data: {
      shopId: shop.id,
      shareLinkId: shareLinkId || null,
      eventType,
      channel: channel || null,
      customerId: customerId || null,
      orderId: orderId || null,
      orderValue: orderValue || null,
      ipCountry: ipCountry || null,
    },
  });
}

/**
 * Analytics summary for the dashboard — last N days.
 */
export async function getAnalyticsSummary(shopDomain, days = 30) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return null;

  let dateFilter = undefined;
  if (days && days !== 'all') {
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days, 10));
    dateFilter = { gte: since };
  }

  const whereClause = { shopId: shop.id };
  if (dateFilter) whereClause.createdAt = dateFilter;

  const [eventCounts, revenueResult] = await Promise.all([
    prisma.shareEvent.groupBy({
      by: ['eventType'],
      where: whereClause,
      _count: true,
    }),
    prisma.shareEvent.aggregate({
      where: { ...whereClause, eventType: "order_placed" },
      _sum: { orderValue: true },
    }),
  ]);

  let totalShares = 0;
  let totalOpens = 0;
  let totalConversions = 0;

  for (const group of eventCounts) {
    if (group.eventType === 'created') totalShares = group._count;
    else if (group.eventType === 'opened') totalOpens = group._count;
    else if (group.eventType === 'order_placed') totalConversions = group._count;
  }

  const totalRevenue = revenueResult._sum.orderValue || 0;

  // We return empty events array because the API expects it for the chart,
  // but we can optimize this further if we refactor the chart to accept grouped data instead of raw events.
  // For backwards compatibility with the current chart we'll fetch the events anyway
  const events = await prisma.shareEvent.findMany({
    where: whereClause,
    orderBy: { createdAt: "asc" },
  });

  return { totalShares, totalOpens, totalConversions, totalRevenue, events };
}

/**
 * Analytics summary for a specific ShareLink.
 */
export async function getShareLinkAnalytics(shopDomain, shareLinkId) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return null;

  const [eventCounts, revenueResult, recentEvents] = await Promise.all([
    prisma.shareEvent.groupBy({
      by: ['eventType'],
      where: { shopId: shop.id, shareLinkId },
      _count: true,
    }),
    prisma.shareEvent.aggregate({
      where: { shopId: shop.id, shareLinkId, eventType: "order_placed" },
      _sum: { orderValue: true },
    }),
    prisma.shareEvent.findMany({
      where: { shopId: shop.id, shareLinkId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  let totalOpens = 0;
  let totalConversions = 0;

  for (const group of eventCounts) {
    if (group.eventType === 'opened') totalOpens = group._count;
    else if (group.eventType === 'order_placed') totalConversions = group._count;
  }

  const totalRevenue = revenueResult._sum.orderValue || 0;

  return { totalOpens, totalConversions, totalRevenue, recentEvents };
}

/**
 * Returns a daily timeseries for chart rendering.
 * @param {string} shopDomain 
 * @param {number} days back
 * @param {string} [linkId] Optional specific link ID
 * @returns {Promise<Array<{date: string, views: number, restores: number, revenue: number}>>}
 */
export async function getTimeseriesAnalytics(shopDomain, days = 30, linkId = null) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  const where = {
    shop: { shopDomain },
    createdAt: { gte: cutoff }
  };

  if (linkId) {
    where.shareLinkId = linkId;
  }

  const events = await prisma.shareEvent.findMany({
    where,
    select: {
      eventType: true,
      orderValue: true,
      createdAt: true
    }
  });

  const timeseries = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    timeseries[dateStr] = {
      date: dateStr,
      views: 0,
      restores: 0,
      checkouts: 0,
      purchases: 0,
      revenue: 0
    };
  }

  for (const event of events) {
    const dateStr = event.createdAt.toISOString().split('T')[0];
    if (timeseries[dateStr]) {
      if (event.eventType === 'view') timeseries[dateStr].views++;
      if (event.eventType === 'restore') timeseries[dateStr].restores++;
      if (event.eventType === 'checkout') timeseries[dateStr].checkouts++;
      if (event.eventType === 'purchase' || event.eventType === 'order_placed') {
        timeseries[dateStr].purchases++;
        if (event.orderValue) {
          timeseries[dateStr].revenue += event.orderValue;
        }
      }
    }
  }

  return Object.values(timeseries);
}
