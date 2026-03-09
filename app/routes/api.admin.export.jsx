import { authenticate } from "../shopify.server";
import { getShareLinksForShop } from "../models/shareLink.server";
import { getAnalyticsSummary } from "../models/shareEvent.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    // Fetch all share links for this shop
    const links = await getShareLinksForShop(shopDomain, { page: 1, limit: 10000 });

    // For each link, fetch its lifetime analytics (impressions, clicks, conversions)
    const rows = [];

    // CSV Header
    rows.push([
        "ID",
        "Token",
        "Name",
        "Status",
        "Created At",
        "Expires At",
        "Total Items",
        "Views",
        "Orders",
        "Revenue",
        "Customer ID",
        "Customer Email",
        "Share URL"
    ].join(","));

    for (const link of links) {
        const analytics = await getAnalyticsSummary(shopDomain, 365, link.id);

        let status = "Active";
        if (!link.isActive) status = "Paused";
        else if (link.expiresAt && new Date(link.expiresAt) < new Date()) status = "Expired";

        let itemCount = 0;
        try {
            const parsedData = JSON.parse(link.cartData);
            itemCount = Array.isArray(parsedData) ? parsedData.length : 0;
        } catch (e) {
            // ignore
        }

        const row = [
            link.id,
            link.token,
            `"${(link.name || "").replace(/"/g, '""')}"`,
            status,
            link.createdAt.toISOString(),
            link.expiresAt ? link.expiresAt.toISOString() : "Never",
            itemCount,
            analytics.totalImpressions || 0,
            analytics.totalConversions || 0,
            (analytics.totalRevenue || 0).toFixed(2),
            link.customerId || "",
            link.customerEmail || "",
            `"${`https://${shopDomain}/?_sc=${link.token}`}"`
        ];

        rows.push(row.join(","));
    }

    const csvContent = rows.join("\n");

    return new Response(csvContent, {
        status: 200,
        headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="sharecart-export-${new Date().toISOString().split('T')[0]}.csv"`
        }
    });
};
