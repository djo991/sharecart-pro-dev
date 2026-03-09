import { useLoaderData, useNavigate, useSubmit, redirect } from "react-router";
import QRCode from "react-qr-code";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    InlineGrid,
    Badge,
    DataTable,
    List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getShop } from "../models/shop.server";
import { getShareLinkById, deleteShareLink } from "../models/shareLink.server";
import { getShareLinkAnalytics, getTimeseriesAnalytics } from "../models/shareEvent.server";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend
} from "recharts";

export const loader = async ({ request, params }) => {
    const { session, admin } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const linkId = params.id;

    // We are not passing customerId here because admin has full access
    const link = await getShareLinkById(linkId);
    if (!link) {
        throw new Response("Share link not found", { status: 404 });
    }

    const shop = await getShop(shopDomain);
    if (link.shopId !== shop?.id) {
        throw new Response("Share link not found", { status: 404 });
    }

    const [analytics, timeseries] = await Promise.all([
        getShareLinkAnalytics(shopDomain, link.id),
        getTimeseriesAnalytics(shopDomain, 30, link.id)
    ]);

    // Fetch shop currency
    const shopQuery = await admin.graphql(`
    #graphql
    query {
      shop {
        currencyCode
      }
    }
  `);
    const shopData = await shopQuery.json();
    const currencyCode = shopData?.data?.shop?.currencyCode || "USD";

    return {
        link,
        analytics,
        timeseries,
        currencyCode,
        shopDomain
    };
};

export const action = async ({ request, params }) => {
    const { session } = await authenticate.admin(request);
    const linkId = params.id;
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "delete") {
        // Authenticate ownership implicitly by checking if shareLink's shopDomain matches
        const link = await getShareLinkById(linkId);
        const shop = await getShop(session.shop);

        if (link && shop && link.shopId === shop.id) {
            await deleteShareLink(linkId);
        }
        return redirect("/app");
    }

    return new Response("Method not allowed", { status: 405 });
};

function KpiCard({ title, value, prefix = "", suffix = "" }) {
    return (
        <Card>
            <BlockStack gap="100">
                <Text variant="bodyMd" tone="subdued">{title}</Text>
                <Text variant="heading2xl" as="p">
                    {prefix}{typeof value === "number" ? value.toLocaleString() : value}{suffix}
                </Text>
            </BlockStack>
        </Card>
    );
}

export default function ShareLinkDetail() {
    const { link, analytics, timeseries, currencyCode, shopDomain } = useLoaderData();
    const navigate = useNavigate();
    const submit = useSubmit();

    const handleDelete = () => {
        if (confirm("Are you sure you want to permanently delete this shared cart? All associated analytics and auto-generated promo codes will be permanently destroyed.")) {
            submit({ intent: "delete" }, { method: "post" });
        }
    };

    const formatter = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currencyCode,
    });

    const url = `https://${shopDomain}/?_sc=${link.token}`;

    let items = [];
    try {
        items = JSON.parse(link.cartData || "[]");
    } catch (e) {
        // Ignore invalid JSON
    }

    let statusTone = "success";
    let statusLabel = "Active";
    if (!link.isActive) {
        statusTone = "warning";
        statusLabel = "Paused";
    } else if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        statusTone = "critical";
        statusLabel = "Expired";
    }

    const eventRows = analytics.recentEvents.map(event => [
        new Date(event.createdAt).toLocaleString(),
        event.eventType,
        event.channel || "—",
        event.orderValue ? formatter.format(event.orderValue) : "—",
        event.ipCountry || "—"
    ]);

    return (
        <Page
            backAction={{ content: 'Dashboard', onAction: () => navigate("/app") }}
            title={link.name || "Untitled Share Link"}
            subtitle={url}
            titleMetadata={<Badge tone={statusTone}>{statusLabel}</Badge>}
            secondaryActions={[
                {
                    content: 'Delete link',
                    destructive: true,
                    onAction: handleDelete,
                },
            ]}
        >
            <Layout>
                <Layout.Section>
                    <InlineGrid columns={3} gap="400">
                        <KpiCard title="Total Opens" value={analytics.totalOpens} />
                        <KpiCard title="Orders Generated" value={analytics.totalConversions} />
                        <KpiCard title="Revenue Generated" value={formatter.format(analytics.totalRevenue)} />
                    </InlineGrid>
                </Layout.Section>

                <Layout.Section>
                    <BlockStack gap="400">
                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingMd" as="h2">30-Day Performance</Text>
                                <div style={{ height: 250, width: '100%' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart
                                            data={timeseries}
                                            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E1E3E5" />
                                            <XAxis
                                                dataKey="date"
                                                tick={{ fill: "#6D7175", fontSize: 12 }}
                                                tickLine={false}
                                                axisLine={false}
                                                tickFormatter={(val) => {
                                                    const d = new Date(val);
                                                    return `${d.getMonth() + 1}/${d.getDate()}`;
                                                }}
                                            />
                                            <YAxis
                                                tick={{ fill: "#6D7175", fontSize: 12 }}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 0 5px rgba(0,0,0,0.1)' }}
                                                labelStyle={{ fontWeight: 'bold', color: '#202223' }}
                                            />
                                            <Legend iconType="circle" wrapperStyle={{ fontSize: '14px', paddingTop: '10px' }} />
                                            <Line type="monotone" name="Views" dataKey="views" stroke="#5C6AC4" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                                            <Line type="monotone" name="Restores" dataKey="restores" stroke="#00A0AC" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                                            <Line type="monotone" name="Purchases" dataKey="purchases" stroke="#50B83C" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingMd" as="h2">Cart Items ({items.length})</Text>
                                {items.length > 0 ? (
                                    <List type="bullet">
                                        {items.map((item, index) => (
                                            <List.Item key={index}>
                                                {item.title} (x{item.quantity})
                                            </List.Item>
                                        ))}
                                    </List>
                                ) : (
                                    <Text tone="subdued">No items in this cart</Text>
                                )}
                            </BlockStack>
                        </Card>

                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingMd" as="h2">Recent Event History</Text>
                                {eventRows.length > 0 ? (
                                    <DataTable
                                        columnContentTypes={['text', 'text', 'text', 'numeric', 'text']}
                                        headings={['Time', 'Event Type', 'Channel', 'Value', 'Country']}
                                        rows={eventRows}
                                    />
                                ) : (
                                    <Text tone="subdued">No events recorded for this link yet.</Text>
                                )}
                            </BlockStack>
                        </Card>
                    </BlockStack>
                </Layout.Section>

                <Layout.Section variant="oneThird">
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd" as="h2">Details</Text>

                            <BlockStack gap="100">
                                <Text variant="headingSm">Created</Text>
                                <Text as="p">{new Date(link.createdAt).toLocaleString()}</Text>
                            </BlockStack>

                            <BlockStack gap="100">
                                <Text variant="headingSm">Expires</Text>
                                <Text as="p">{link.expiresAt ? new Date(link.expiresAt).toLocaleString() : "Never"}</Text>
                            </BlockStack>

                            {link.description && (
                                <BlockStack gap="100">
                                    <Text variant="headingSm">Description</Text>
                                    <Text as="p">{link.description}</Text>
                                </BlockStack>
                            )}

                            {link.customerEmail && (
                                <BlockStack gap="100">
                                    <Text variant="headingSm">Created By</Text>
                                    <Text as="p">{link.customerEmail}</Text>
                                </BlockStack>
                            )}
                        </BlockStack>
                    </Card>

                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd" as="h2">QR Code</Text>
                            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                                <QRCode value={url} size={180} />
                            </div>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
