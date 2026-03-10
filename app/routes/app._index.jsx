import { useLoaderData, useNavigate, useSubmit, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  DataTable,
  Badge,
  EmptyState,
  Box,
  Link,
  Button,
  Select,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { findOrCreateShop } from "../models/shop.server";
import { getAnalyticsSummary, getTimeseriesAnalytics } from "../models/shareEvent.server";
import { getShareLinksForShop, toggleShareLink } from "../models/shareLink.server";
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

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const id = formData.get("id");
  const action = formData.get("_action");

  if (action === "toggle") {
    await toggleShareLink(id);
  }
  return null;
};

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  await findOrCreateShop(shopDomain);

  // Fetch shop currency from Shopify Admin GraphQL
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

  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days") || "30";
  const days = daysParam === "all" ? "all" : parseInt(daysParam, 10);

  const [summary, recentLinks, timeseries] = await Promise.all([
    getAnalyticsSummary(shopDomain, days),
    getShareLinksForShop(shopDomain, { take: 10 }),
    getTimeseriesAnalytics(shopDomain, days === "all" ? 90 : days)
  ]);

  return { shopDomain, summary, recentLinks, currencyCode, daysParam, timeseries };
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

export default function Dashboard() {
  const { summary, recentLinks, currencyCode, shopDomain, daysParam, timeseries } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();

  const handleToggle = (id) => {
    submit({ _action: "toggle", id }, { method: "post" });
  };

  const handleDaysChange = (value) => {
    submit({ days: value }, { method: "get" });
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const res = await fetch(`/api/admin/export?shop=${shopDomain}`);
      if (!res.ok) throw new Error("Failed to export");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sharecart-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  // Format currency based on the shop's code
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyCode,
  });

  const rows = recentLinks.map((link) => {
    const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();

    let statusBadge;
    if (isExpired) {
      statusBadge = <Badge tone="critical">Expired</Badge>;
    } else if (link.isActive) {
      statusBadge = <Badge tone="success">Active</Badge>;
    } else {
      statusBadge = <Badge tone="warning">Paused</Badge>;
    }

    const isToggling = navigation.state === "submitting" && navigation.formData?.get("id") === link.id;

    return [
      <Button
        variant="plain"
        onClick={() => navigate(`/app/share-links/${link.id}`)}
      >
        <Text fontWeight="bold">{link.token.slice(0, 8)}…</Text>
      </Button>,
      new Date(link.createdAt).toLocaleDateString(),
      link.customerEmail || "—",
      statusBadge,
      link.impressions ?? 0,
      link.completedPurchases ?? 0,
      <Button
        onClick={() => handleToggle(link.id)}
        disabled={isExpired || isToggling}
        loading={isToggling}
      >
        {link.isActive ? "Pause" : "Resume"}
      </Button>
    ];
  });

  return (
    <Page
      title="ShareCart Pro"
      primaryAction={{
        content: 'Export Analytics (CSV)',
        onAction: handleExport,
        icon: 'ExportIcon',
        loading: isExporting,
      }}
    >
      <Layout>
        <Layout.Section>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <div style={{ width: '200px' }}>
              <Select
                label="Date Range"
                labelHidden
                options={[
                  { label: "Last 7 days", value: "7" },
                  { label: "Last 30 days", value: "30" },
                  { label: "Last 90 days", value: "90" },
                  { label: "All time", value: "all" }
                ]}
                value={daysParam}
                onChange={handleDaysChange}
              />
            </div>
          </div>
          <InlineGrid columns={4} gap="400">
            <KpiCard title="Share links created" value={summary?.totalShares ?? 0} />
            <KpiCard title="Links opened" value={summary?.totalOpens ?? 0} />
            <KpiCard title="Orders placed" value={summary?.totalConversions ?? 0} />
            <KpiCard
              title="Revenue from shares"
              value={formatter.format(summary?.totalRevenue ?? 0)}
            />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Performance Overview</Text>
              <div style={{ height: 300, width: '100%' }}>
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
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Recent share links</Text>
              {recentLinks.length === 0 ? (
                <EmptyState
                  heading="No share links yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Once customers start sharing their carts, links will appear here.</p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "numeric", "numeric", "text"]}
                  headings={["Token", "Created", "Shared by", "Status", "Impressions", "Conversions", "Action"]}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
