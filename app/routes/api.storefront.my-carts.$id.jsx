import { authenticate } from "../shopify.server";
import { archiveShareLink } from "../models/shareLink.server";

/**
 * App proxy endpoint: /apps/sharecart/api/storefront/my-carts/:id
 * DELETE — soft-deletes (archives) the share cart identified by :id.
 *
 * Auth: Shopify app proxy appends ?logged_in_customer_id=... for logged-in customers.
 * The customer ID is the numeric Shopify customer ID (same format stored on ShareLink).
 */
export const action = async ({ request, params }) => {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const customerId = url.searchParams.get("logged_in_customer_id");

  if (!customerId) {
    return Response.json(
      { error: "Unauthorized — customer not logged in" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { id } = params;
  const result = await archiveShareLink(id, customerId);

  if (!result) {
    return Response.json(
      { error: "Not found or access denied" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  return Response.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } }
  );
};

export const loader = async () => {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
};
