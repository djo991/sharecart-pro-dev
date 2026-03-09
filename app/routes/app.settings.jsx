import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Select,
  Checkbox,
  BlockStack,
  Text,
  Banner,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { getShop, updateShopSettings } from "../models/shop.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getShop(session.shop);
  // Note: metafield sync now runs from app.jsx root loader on every admin visit.

  return { settings: shop?.settings || {} };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  try {
    await updateShopSettings(session.shop, {
      buttonLabel: formData.get("buttonLabel") || "Share Cart",
      buttonColor: formData.get("buttonColor") || "#000000",
      buttonTextColor: formData.get("buttonTextColor") || "#ffffff",
      buttonPosition: formData.get("buttonPosition") || "after-cart-actions",
      enabledChannels: formData.get("enabledChannels") || "link,whatsapp,facebook,twitter,email",
      linkExpireDays: formData.get("linkExpireDays")
        ? parseInt(formData.get("linkExpireDays"))
        : null,
      // Form field toggles
      showNameField: formData.get("showNameField") === "true",
      showDescriptionField: formData.get("showDescriptionField") === "true",
      showPromoField: formData.get("showPromoField") === "true",
      showExpiryField: formData.get("showExpiryField") === "true",
      showSaveOption: formData.get("showSaveOption") === "true",
      // Redirect & Share Message
      redirectTarget: formData.get("redirectTarget") || "cart",
      defaultShareMessage: formData.get("defaultShareMessage") || "Check out my cart!",
      customWebhookUrl: formData.get("customWebhookUrl") || null,
      // Customer permissions
      allowCustomerDeactivate: formData.get("allowCustomerDeactivate") === "true",
      allowCustomerDelete: formData.get("allowCustomerDelete") === "true",
      showExpiredCarts: formData.get("showExpiredCarts") === "true",
      // Product exclusion
      excludeTag: formData.get("excludeTag") || "no-shared-cart",
      // Visibility
      visibilityMode: formData.get("visibilityMode") || "logged_in",
      visibilityTag: formData.get("visibilityTag") || "",
    });
    return { saved: true };
  } catch (err) {
    return { error: err.message || "Failed to save settings" };
  }
};

const CHANNELS = ["link", "whatsapp", "facebook", "twitter", "email"];

export default function Settings() {
  const { settings } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    if (actionData?.saved) {
      setSavedBanner(true);
      const t = setTimeout(() => setSavedBanner(false), 3000);
      return () => clearTimeout(t);
    }
    if (actionData?.error) setSavedBanner(false);
  }, [actionData]);

  // Button settings
  const [buttonLabel, setButtonLabel] = useState(settings.buttonLabel ?? "Share Cart");
  const [buttonColor, setButtonColor] = useState(settings.buttonColor ?? "#000000");
  const [buttonTextColor, setButtonTextColor] = useState(settings.buttonTextColor ?? "#ffffff");
  const [buttonPosition, setButtonPosition] = useState(settings.buttonPosition ?? "after-cart-actions");
  const [linkExpireDays, setLinkExpireDays] = useState(settings.linkExpireDays ? String(settings.linkExpireDays) : "");

  const currentChannels = (settings.enabledChannels ?? "link,whatsapp,facebook,twitter,email").split(",");
  const [enabledChannels, setEnabledChannels] = useState(currentChannels);

  // Form field toggles
  const [showNameField, setShowNameField] = useState(settings.showNameField !== false);
  const [showDescriptionField, setShowDescriptionField] = useState(settings.showDescriptionField !== false);
  const [showPromoField, setShowPromoField] = useState(settings.showPromoField === true);
  const [showExpiryField, setShowExpiryField] = useState(settings.showExpiryField !== false);
  const [showSaveOption, setShowSaveOption] = useState(settings.showSaveOption !== false);

  // Redirect & Share Message
  const [redirectTarget, setRedirectTarget] = useState(settings.redirectTarget ?? "cart");
  const [defaultShareMessage, setDefaultShareMessage] = useState(settings.defaultShareMessage ?? "Check out my cart!");
  const [customWebhookUrl, setCustomWebhookUrl] = useState(settings.customWebhookUrl ?? "");

  // Customer permissions
  const [allowCustomerDeactivate, setAllowCustomerDeactivate] = useState(settings.allowCustomerDeactivate !== false);
  const [allowCustomerDelete, setAllowCustomerDelete] = useState(settings.allowCustomerDelete !== false);
  const [showExpiredCarts, setShowExpiredCarts] = useState(settings.showExpiredCarts === true);

  // Product exclusion
  const [excludeTag, setExcludeTag] = useState(settings.excludeTag ?? "no-shared-cart");

  // Visibility
  const [visibilityMode, setVisibilityMode] = useState(settings.visibilityMode ?? "logged_in");
  const [visibilityTag, setVisibilityTag] = useState(settings.visibilityTag ?? "");

  function toggleChannel(channel) {
    setEnabledChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  }

  function handleSave() {
    const data = {
      buttonLabel,
      buttonColor,
      buttonTextColor,
      buttonPosition,
      enabledChannels: enabledChannels.join(","),
      linkExpireDays,
      showNameField: String(showNameField),
      showDescriptionField: String(showDescriptionField),
      showPromoField: String(showPromoField),
      showExpiryField: String(showExpiryField),
      showSaveOption: String(showSaveOption),
      redirectTarget,
      defaultShareMessage,
      customWebhookUrl,
      allowCustomerDeactivate: String(allowCustomerDeactivate),
      allowCustomerDelete: String(allowCustomerDelete),
      showExpiredCarts: String(showExpiredCarts),
      excludeTag,
      visibilityMode,
      visibilityTag,
    };
    submit(data, { method: "post" });
  }

  return (
    <Page
      title="Settings"
      primaryAction={{ content: saving ? "Saving\u2026" : "Save", onAction: handleSave, loading: saving }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">

            {savedBanner && (
              <Banner tone="success" onDismiss={() => setSavedBanner(false)}>
                Settings saved successfully.
              </Banner>
            )}
            {actionData?.error && (
              <Banner tone="critical" onDismiss={() => { }}>
                {actionData.error}
              </Banner>
            )}

            {/* ── Share Button ── */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Share button</Text>
                <FormLayout>
                  <TextField
                    label="Button label"
                    value={buttonLabel}
                    onChange={setButtonLabel}
                    autoComplete="off"
                  />
                  <FormLayout.Group>
                    <TextField
                      label="Button color (hex)"
                      value={buttonColor}
                      onChange={setButtonColor}
                      autoComplete="off"
                      prefix={
                        <span style={{ display: "inline-block", width: 16, height: 16, borderRadius: 3, background: buttonColor, border: "1px solid #ccc" }} />
                      }
                    />
                    <TextField
                      label="Text color (hex)"
                      value={buttonTextColor}
                      onChange={setButtonTextColor}
                      autoComplete="off"
                      prefix={
                        <span style={{ display: "inline-block", width: 16, height: 16, borderRadius: 3, background: buttonTextColor, border: "1px solid #ccc" }} />
                      }
                    />
                  </FormLayout.Group>
                  <Select
                    label="Button position on cart page"
                    options={[
                      { label: "After cart actions", value: "after-cart-actions" },
                      { label: "Before cart actions", value: "before-cart-actions" },
                    ]}
                    value={buttonPosition}
                    onChange={setButtonPosition}
                  />
                </FormLayout>
              </BlockStack>
            </Card>

            {/* ── Share Channels ── */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Share channels</Text>
                <Text tone="subdued">Choose which channels appear in the share modal.</Text>
                <BlockStack gap="200">
                  {CHANNELS.map((channel) => (
                    <Checkbox
                      key={channel}
                      label={channel.charAt(0).toUpperCase() + channel.slice(1)}
                      checked={enabledChannels.includes(channel)}
                      onChange={() => toggleChannel(channel)}
                    />
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>

            {/* ── Share Form Fields ── */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Share form fields</Text>
                <Text tone="subdued">Choose which optional fields customers see when creating a share link.</Text>
                <BlockStack gap="200">
                  <Checkbox label="Cart name" checked={showNameField} onChange={setShowNameField} />
                  <Checkbox label="Description" checked={showDescriptionField} onChange={setShowDescriptionField} />
                  <Checkbox label="Promo code" checked={showPromoField} onChange={setShowPromoField} helpText="Allow customers to attach a discount code to shared links" />
                  <Checkbox label="Expiry selector" checked={showExpiryField} onChange={setShowExpiryField} />
                  <Checkbox label="Save cart option" checked={showSaveOption} onChange={setShowSaveOption} helpText="Let customers save shared carts to their account" />
                </BlockStack>
              </BlockStack>
            </Card>

            {/* ── Link Expiry & Redirect ── */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Link behavior</Text>
                <FormLayout>
                  <TextField
                    label="Default link expiry (days)"
                    type="number"
                    value={linkExpireDays}
                    onChange={setLinkExpireDays}
                    placeholder="Leave blank for links that never expire"
                    autoComplete="off"
                    min="1"
                    helpText="Customers can override this per-link if expiry selector is enabled"
                  />
                  <Select
                    label="After cart restoration, redirect to"
                    options={[
                      { label: "Home page (Auto-adds items)", value: "home" },
                      { label: "Cart page (Auto-adds items)", value: "cart" },
                      { label: "Checkout (Auto-adds items)", value: "checkout" },
                      { label: "Cart preview modal (Requires user to click add)", value: "preview" },
                    ]}
                    value={redirectTarget}
                    onChange={setRedirectTarget}
                    helpText="Where recipients land after their cart is restored from a share link"
                  />
                  <TextField
                    label="Default share message"
                    value={defaultShareMessage}
                    onChange={setDefaultShareMessage}
                    autoComplete="off"
                    helpText="Default text used when customers share their cart via WhatsApp, Twitter, or Email"
                  />
                  <TextField
                    label="Custom Webhook URL on Share"
                    value={customWebhookUrl}
                    onChange={setCustomWebhookUrl}
                    autoComplete="off"
                    placeholder="https://your-server.com/webhook"
                    helpText="We will POST the share link details to this URL immediately after it is created."
                  />
                </FormLayout>
              </BlockStack>
            </Card>

            {/* ── Visibility Rules ── */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Visibility rules</Text>
                <Text tone="subdued">Control who can see the Share Cart button on your storefront.</Text>
                <FormLayout>
                  <Select
                    label="Show Share Cart button to"
                    options={[
                      { label: "All visitors (including guests)", value: "all" },
                      { label: "Logged-in customers only", value: "logged_in" },
                      { label: "Customers with a specific tag", value: "tagged" },
                    ]}
                    value={visibilityMode}
                    onChange={setVisibilityMode}
                  />
                  {visibilityMode === "tagged" && (
                    <TextField
                      label="Required customer tag"
                      value={visibilityTag}
                      onChange={setVisibilityTag}
                      placeholder="e.g., wholesale, vip, can-share"
                      autoComplete="off"
                      helpText="Only customers with this tag will see the Share Cart button"
                    />
                  )}
                </FormLayout>
              </BlockStack>
            </Card>

            {/* ── Customer Account Permissions ── */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Customer account</Text>
                <Text tone="subdued">Manage what customers can do with their shared carts in My Account.</Text>
                <BlockStack gap="200">
                  <Checkbox label="Allow customers to pause/resume share links" checked={allowCustomerDeactivate} onChange={setAllowCustomerDeactivate} />
                  <Checkbox label="Allow customers to delete share links" checked={allowCustomerDelete} onChange={setAllowCustomerDelete} />
                  <Checkbox label="Show expired carts in customer account" checked={showExpiredCarts} onChange={setShowExpiredCarts} />
                </BlockStack>
              </BlockStack>
            </Card>

            {/* ── Product Exclusion ── */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Product exclusion</Text>
                <TextField
                  label="Exclude products with tag"
                  value={excludeTag}
                  onChange={setExcludeTag}
                  autoComplete="off"
                  helpText="Products with this tag will be excluded from shared carts"
                />
              </BlockStack>
            </Card>

          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
