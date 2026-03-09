import { authenticate } from "../shopify.server";
import { getShop } from "../models/shop.server";

/**
 * App proxy endpoint: /apps/sharecart/api/storefront/config
 * Returns shop settings as JSON so the storefront JS can apply DB-driven config.
 * Called by sharecart-init.liquid as window.__sharecartReady promise.
 * The Shopify proxy strips /apps/sharecart, so this route is reached at /api/storefront/config.
 */
export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  const shop = await getShop(session.shop);
  const s = shop?.settings || {};

  return Response.json(
    {
      visibilityMode: s.visibilityMode ?? "logged_in",
      visibilityTag: s.visibilityTag ?? "",
      redirectTarget: s.redirectTarget ?? "cart",
      showNameField: s.showNameField !== false,
      showDescriptionField: s.showDescriptionField !== false,
      showPromoField: s.showPromoField === true,
      showExpiryField: s.showExpiryField !== false,
      showSaveOption: s.showSaveOption !== false,
      // Button appearance
      buttonLabel: s.buttonLabel ?? "Share Cart",
      buttonColor: s.buttonColor ?? "#000000",
      buttonTextColor: s.buttonTextColor ?? "#ffffff",
      enabledChannels: s.enabledChannels ?? "link,whatsapp,facebook,twitter,email",
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
};
