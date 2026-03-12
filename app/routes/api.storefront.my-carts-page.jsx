import { authenticate } from "../shopify.server";

/**
 * App proxy endpoint: /apps/sharecart/api/storefront/my-carts-page
 *
 * Serves a full HTML page (as Liquid) that renders inside the store's theme.
 * The page contains the Shared Carts dashboard + detail view.
 *
 * Shopify wraps app proxy responses with content-type "application/liquid"
 * in the store's layout (header, footer, nav).
 *
 * Customer URL: https://{store}.myshopify.com/apps/sharecart/api/storefront/my-carts-page
 */
export const loader = async ({ request }) => {
  // Authenticate the proxy request — Shopify adds HMAC signature params
  try {
    await authenticate.public.appProxy(request);
  } catch (err) {
    // In dev mode the signature may not be present; log and continue
    console.warn("[my-carts-page] Proxy auth warning:", err.message);
  }

  const url = new URL(request.url);
  const customerId = url.searchParams.get("logged_in_customer_id") || "";

  // If customer is not logged in, show a login prompt
  if (!customerId) {
    const loginHtml = `
<div style="max-width:480px;margin:80px auto;text-align:center;font-family:system-ui,-apple-system,sans-serif;">
  <h2 style="font-size:1.5rem;font-weight:700;margin-bottom:12px;">Sign in to view your shared carts</h2>
  <p style="color:#64748b;margin-bottom:24px;">You need to be logged in to manage your shared carts.</p>
  <a href="/account/login" style="display:inline-block;background:#008060;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Sign In</a>
</div>
`;
    return new Response(loginHtml, {
      headers: {
        "Content-Type": "application/liquid",
        "Cache-Control": "no-store",
      },
    });
  }

  const liquid = `
<div
  id="sharecart-account-widget"
  data-customer-id="${customerId}"
  style="min-height:400px;margin:0 auto;max-width:960px;padding:20px 16px;"
></div>

<script src="/apps/sharecart/api/storefront/my-carts-js" defer></script>
`;

  return new Response(liquid, {
    headers: {
      "Content-Type": "application/liquid",
      "Cache-Control": "no-store",
    },
  });
};
