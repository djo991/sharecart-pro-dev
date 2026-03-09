import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Modal,
  FormLayout,
  TextField,
  Select,
  Badge,
  EmptyState,
  Banner,
  Box,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import {
  getAllParamRules,
  createParamRule,
  updateParamRule,
  deleteParamRule,
} from "../models/paramRule.server";

import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const [rules, shop] = await Promise.all([
    getAllParamRules(shopDomain),
    prisma.shop.findUnique({
      where: { shopDomain },
      include: { settings: true }
    })
  ]);

  return {
    rules,
    shopDomain,
    preserveShareParams: shop?.settings?.preserveShareParams ?? false
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateSettings") {
    const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
    if (shop) {
      await prisma.shopSettings.upsert({
        where: { shopId: shop.id },
        update: { preserveShareParams: formData.get("preserveShareParams") === "true" },
        create: { shopId: shop.id, preserveShareParams: formData.get("preserveShareParams") === "true" }
      });
    }
  } else if (intent === "create") {
    await createParamRule(session.shop, {
      paramKey: formData.get("paramKey"),
      paramValue: formData.get("paramValue"),
      channelOverrides: null,
    });
  } else if (intent === "toggle") {
    const id = formData.get("id");
    const isActive = formData.get("isActive") === "true";
    await updateParamRule(id, { isActive: !isActive });
  } else if (intent === "delete") {
    await deleteParamRule(formData.get("id"));
  }

  return { ok: true };
};

const TOKEN_SUGGESTIONS = ["{customer_id}", "{customer_email}", "{share_date}", "{channel}"];
const KEY_SUGGESTIONS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref", "affid", "custom"];

// Build a sample URL preview from active rules
function buildPreview(rules, shop) {
  const active = rules.filter((r) => r.isActive);
  if (active.length === 0) return `https://${shop}/?_sc=abc123`;
  const params = active.map((r) => `${r.paramKey}=${r.paramValue}`).join("&");
  return `https://${shop}/?_sc=abc123&${params}`;
}

export default function Params() {
  const { rules, shopDomain, preserveShareParams } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [modalOpen, setModalOpen] = useState(false);
  const [paramKey, setParamKey] = useState("");
  const [paramValue, setParamValue] = useState("");

  function handleCreate() {
    if (!paramKey || !paramValue) return;
    submit({ intent: "create", paramKey, paramValue }, { method: "post" });
    setParamKey("");
    setParamValue("");
    setModalOpen(false);
  }

  function handleToggle(rule) {
    submit({ intent: "toggle", id: rule.id, isActive: String(rule.isActive) }, { method: "post" });
  }

  function handleDelete(id) {
    if (confirm("Delete this parameter rule?")) {
      submit({ intent: "delete", id }, { method: "post" });
    }
  }

  const rows = rules.map((rule) => [
    <Text fontWeight="semibold">{rule.paramKey}</Text>,
    <Text tone="subdued">{rule.paramValue}</Text>,
    rule.isActive
      ? <Badge tone="success">Active</Badge>
      : <Badge tone="disabled">Inactive</Badge>,
    <InlineStack gap="200">
      <Button size="slim" onClick={() => handleToggle(rule)}>
        {rule.isActive ? "Disable" : "Enable"}
      </Button>
      <Button size="slim" tone="critical" onClick={() => handleDelete(rule.id)}>
        Delete
      </Button>
    </InlineStack>,
  ]);

  function handleTogglePreserveParams(value) {
    const formData = new FormData();
    formData.append("intent", "updateSettings");
    formData.append("preserveShareParams", String(value));
    submit(formData, { method: "post" });
  }

  return (
    <Page
      title="URL Parameters"
      subtitle="Define parameters appended to every share link your customers generate."
      primaryAction={{ content: "Add parameter", onAction: () => setModalOpen(true) }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">

            <Banner tone="info">
              <p>
                Parameters defined here are automatically appended to every share link.
                Use tokens like <code>{"{customer_id}"}</code> to insert dynamic values at the time of sharing.
                All params are also preserved through Shopify's cart redirect and written to cart attributes — so they survive to the order.
              </p>
            </Banner>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Active rules</Text>
                {rules.length === 0 ? (
                  <EmptyState
                    heading="No parameter rules yet"
                    action={{ content: "Add your first rule", onAction: () => setModalOpen(true) }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Add UTM params, affiliate IDs, or any custom parameters to track where your shared carts come from.</p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text"]}
                    headings={["Parameter", "Value / Token", "Status", "Actions"]}
                    rows={rows}
                  />
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Additional Settings</Text>

                <Box paddingBlockEnd="200">
                  <InlineStack align="space-between" blockAlign="start">
                    <BlockStack gap="100">
                      <Text variant="headingSm" as="h3">Preserve current URL parameters</Text>
                      <Text tone="subdued" as="p">
                        When a customer generates a share link, ShareCart will capture their current browser URL parameters
                        (like UTM tags or affiliate IDs) and append them perfectly to the final shared link.
                      </Text>
                    </BlockStack>
                    <div style={{ paddingLeft: '16px' }}>
                      <Button
                        tone={preserveShareParams ? "critical" : "success"}
                        onClick={() => handleTogglePreserveParams(!preserveShareParams)}
                      >
                        {preserveShareParams ? "Disable Preservation" : "Enable Preservation"}
                      </Button>
                    </div>
                  </InlineStack>
                </Box>
              </BlockStack>
            </Card>

            {rules.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Share URL preview</Text>
                  <Text tone="subdued">This is what a generated share URL will look like with your current active rules:</Text>
                  <Box
                    background="bg-surface-secondary"
                    padding="300"
                    borderRadius="200"
                  >
                    <Text as="p" variant="bodySm" breakWord>
                      <code>{buildPreview(rules, shopDomain)}</code>
                    </Text>
                  </Box>
                </BlockStack>
              </Card>
            )}

          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add URL parameter"
        primaryAction={{ content: "Add", onAction: handleCreate, disabled: !paramKey || !paramValue }}
        secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Parameter key"
              value={paramKey}
              onChange={setParamKey}
              placeholder="e.g. utm_source"
              autoComplete="off"
              helpText={
                <InlineStack gap="100" wrap>
                  <Text tone="subdued" variant="bodySm">Suggestions:</Text>
                  {KEY_SUGGESTIONS.map((s) => (
                    <Button key={s} size="micro" onClick={() => setParamKey(s)}>{s}</Button>
                  ))}
                </InlineStack>
              }
            />
            <TextField
              label="Value"
              value={paramValue}
              onChange={setParamValue}
              placeholder="e.g. sharecart or {customer_id}"
              autoComplete="off"
              helpText={
                <InlineStack gap="100" wrap>
                  <Text tone="subdued" variant="bodySm">Dynamic tokens:</Text>
                  {TOKEN_SUGGESTIONS.map((t) => (
                    <Button key={t} size="micro" onClick={() => setParamValue(t)}>{t}</Button>
                  ))}
                </InlineStack>
              }
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
