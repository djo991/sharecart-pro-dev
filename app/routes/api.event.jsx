import { logEvent } from "../models/shareEvent.server";
import { authenticate } from "../shopify.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { session } = await authenticate.public.appProxy(request);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }
    const shop = session.shop;

    const body = await request.json();
    const { token, eventType, channel, customerId, orderId, orderValue } = body;

    if (!eventType) {
      return Response.json({ error: "Missing required fields" }, { status: 400, headers: CORS_HEADERS });
    }

    // Look up the share link if a token was provided
    let shareLinkId = null;
    if (token) {
      const prismaModule = await import("../db.server");
      const prisma = prismaModule.default;
      const link = await prisma.shareLink.findUnique({ where: { token } });
      shareLinkId = link?.id || null;
    }

    await logEvent({
      shopDomain: shop,
      shareLinkId,
      eventType,
      channel: channel || null,
      customerId: customerId || null,
      orderId: orderId || null,
      orderValue: orderValue ? parseFloat(orderValue) : null,
    });

    return Response.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("[/api/event] Error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
};
