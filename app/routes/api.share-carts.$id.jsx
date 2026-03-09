import {
  getShareLinkById,
  updateShareLink,
  archiveShareLink,
} from "../models/shareLink.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request, params }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    const link = await getShareLinkById(params.id, customerId);

    if (!link) {
      return Response.json(
        { error: "Share cart not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return Response.json(
      {
        id: link.id,
        token: link.token,
        name: link.name,
        description: link.description,
        items: JSON.parse(link.cartData),
        isActive: link.isActive,
        isSaved: link.isSaved,
        neverExpires: link.neverExpires,
        impressions: link.impressions,
        completedPurchases: link.completedPurchases,
        expiresAt: link.expiresAt,
        createdAt: link.createdAt,
        promoCodes: link.promoCodes.map((p) => p.code),
        orders: link.orders,
        eventCount: link._count.events,
        orderCount: link._count.orders,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[/api/share-carts/:id] GET Error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

export const action = async ({ request, params }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");

    // DELETE → soft delete (archive)
    if (request.method === "DELETE") {
      const result = await archiveShareLink(params.id, customerId);
      if (!result) {
        return Response.json(
          { error: "Share cart not found" },
          { status: 404, headers: CORS_HEADERS }
        );
      }
      return Response.json({ ok: true }, { headers: CORS_HEADERS });
    }

    // PUT → update share cart
    if (request.method === "PUT" || request.method === "PATCH") {
      const body = await request.json();
      const updates = {};

      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.items !== undefined) updates.items = body.items;
      if (body.neverExpires !== undefined) updates.neverExpires = body.neverExpires;
      if (body.expiresAt !== undefined) updates.expiresAt = new Date(body.expiresAt);
      if (body.promoCodes !== undefined) updates.promoCodes = body.promoCodes;

      const result = await updateShareLink(params.id, customerId, updates);
      if (!result) {
        return Response.json(
          { error: "Share cart not found" },
          { status: 404, headers: CORS_HEADERS }
        );
      }

      return Response.json(
        {
          id: result.id,
          token: result.token,
          name: result.name,
          description: result.description,
          isActive: result.isActive,
          promoCodes: result.promoCodes.map((p) => p.code),
        },
        { headers: CORS_HEADERS }
      );
    }

    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[/api/share-carts/:id] Action Error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
