import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createOrder } from "../models/order.server";
import { logEvent } from "../models/shareEvent.server";
import { incrementPurchases } from "../models/shareLink.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.debug(`[Webhook] ${topic} from ${shop}`);

  switch (topic) {
    case "APP_UNINSTALLED": {
      // Mark shop as inactive — keep data for GDPR requests but stop processing
      await prisma.shop.updateMany({
        where: { shopDomain: shop },
        data: { updatedAt: new Date() },
      });
      break;
    }

    case "CUSTOMERS_DATA_REQUEST": {
      // GDPR: merchant requesting customer data export
      // Log it — in a production app you'd email the data to payload.data_request.email
      console.debug(`[GDPR] Data request for shop ${shop}`, payload);
      break;
    }

    case "CUSTOMERS_REDACT": {
      // GDPR: delete customer data
      const customerId = String(payload.customer?.id);
      if (customerId) {
        const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
        if (shopRecord) {
          await prisma.shareLink.updateMany({
            where: { shopId: shopRecord.id, customerId },
            data: { customerEmail: null, customerId: null, name: "", description: "" },
          });
          await prisma.savedCart.deleteMany({
            where: { shopId: shopRecord.id, customerId },
          });
          await prisma.shareEvent.updateMany({
            where: { shopId: shopRecord.id, customerId },
            data: { customerId: null },
          });
          await prisma.order.updateMany({
            where: { shopifyCustomerId: customerId },
            data: { shopifyCustomerId: null, shopifyCustomerEmail: null },
          });
        }
      }
      break;
    }

    case "SHOP_REDACT": {
      // GDPR: delete all shop data 30 days after uninstall
      const shopRecord = await prisma.shop.findUnique({
        where: { shopDomain: shop },
      });
      if (shopRecord) {
        // Delete in dependency order
        await prisma.shareEvent.deleteMany({ where: { shopId: shopRecord.id } });
        await prisma.order.deleteMany({
          where: { shareLink: { shopId: shopRecord.id } }
        });
        await prisma.promoCode.deleteMany({
          where: { shareLink: { shopId: shopRecord.id } }
        });
        await prisma.shareLink.deleteMany({ where: { shopId: shopRecord.id } });
        await prisma.savedCart.deleteMany({ where: { shopId: shopRecord.id } });
        await prisma.paramRule.deleteMany({ where: { shopId: shopRecord.id } });
        await prisma.shopSettings.deleteMany({ where: { shopId: shopRecord.id } });
        await prisma.shop.delete({ where: { id: shopRecord.id } });
      }
      break;
    }

    case "ORDERS_CREATE": {
      // Match order to a ShareLink via _sc cart/note attributes
      let shareLinkToken = null;

      if (Array.isArray(payload.note_attributes)) {
        const scAttr = payload.note_attributes.find(
          (attr) => attr.name === "_sc_token" || attr.name === "_sc"
        );
        if (scAttr) shareLinkToken = scAttr.value;
      }

      if (shareLinkToken) {
        const shareLink = await prisma.shareLink.findUnique({
          where: { token: shareLinkToken },
        });

        if (shareLink) {
          // Create Order record
          await createOrder({
            shareLinkId: shareLink.id,
            shopifyOrderId: payload.id,
            shopifyOrderName: payload.name || null,
            shopifyCustomerId: payload.customer?.id,
            shopifyCustomerEmail:
              payload.customer?.email || payload.email || null,
            orderValue: payload.total_price,
          });

          // Increment denormalized counter
          await incrementPurchases(shareLink.id);

          // Log event for dashboard analytics
          await logEvent({
            shopDomain: shop,
            shareLinkId: shareLink.id,
            eventType: "order_placed",
            customerId: payload.customer?.id
              ? String(payload.customer.id)
              : null,
            orderId: String(payload.id),
            orderValue: payload.total_price
              ? parseFloat(payload.total_price)
              : null,
            ipCountry:
              payload.shipping_address?.country_code || null,
          });

          console.debug(
            `[Webhook] ORDERS_CREATE — linked order #${payload.name || payload.id} to ShareLink ${shareLinkToken}`
          );
        } else {
          console.debug(
            `[Webhook] ORDERS_CREATE — _sc token "${shareLinkToken}" not found in DB`
          );
        }
      } else {
        // Order not from a share link — ignore
      }
      break;
    }

    case "APP_SCOPES_UPDATE": {
      console.debug(`[Webhook] Scopes updated for ${shop}`);
      break;
    }

    default:
      console.warn(`[Webhook] Unhandled topic: ${topic}`);
  }

  return new Response(null, { status: 200 });
};
