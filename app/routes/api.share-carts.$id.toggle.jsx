import { toggleShareLink } from "../models/shareLink.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const action = async ({ request, params }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");

    const result = await toggleShareLink(params.id, customerId);
    if (!result) {
      return Response.json(
        { error: "Share cart not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return Response.json(
      { ok: true, isActive: result.isActive },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[/api/share-carts/:id/toggle] Error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
