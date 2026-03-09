/**
 * Syncs the app's direct URL into a shop metafield so the customer account
 * UI extension can discover it via shopify.query (Customer Account API) —
 * the only CORS-free channel available inside a customer account extension.
 *
 * Key fix: admin.graphql() returns a Response object (see graphql.js line 21:
 *   return new Response(JSON.stringify(apiResponse));
 * so every call must be followed by await .json() to get the parsed data.
 *
 * Metafield written:
 *   namespace: "sharecart"
 *   key:       "api_url"
 *   owner:     SHOP
 *   access:    storefront PUBLIC_READ + customerAccount READ
 */
export async function syncApiUrlMetafield(admin, requestUrl = "") {
  // Primary: Shopify CLI injects this when running shopify app dev / deploy.
  // Fallback: derive from the incoming request URL (the app server's own URL
  // when the admin iframe loads the route).
  let appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/+$/, "");
  if (!appUrl && requestUrl) {
    try {
      appUrl = new URL(requestUrl).origin;
    } catch (_) { }
  }
  if (!appUrl) {
    console.error("[ShareCart] syncApiUrlMetafield: could not resolve appUrl");
    return;
  }

  console.debug("[ShareCart] syncApiUrlMetafield: syncing url =", appUrl);

  try {
    // ── 1. Create metafield definition ──────────────────────────────────────
    // access.customerAccount = PUBLIC_READ makes the value readable via
    // shopify.query() in the customer account extension.
    // ALREADY_EXISTS / TAKEN on repeated calls is expected and handled below.
    const createResp = await admin.graphql(
      `mutation DefineSharecartApiUrl($def: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $def) {
          createdDefinition { id }
          userErrors { code field message }
        }
      }`,
      {
        variables: {
          def: {
            namespace: "sharecart",
            key: "api_url",
            name: "ShareCart API URL",
            type: "single_line_text_field",
            ownerType: "SHOP",
            access: {
              storefront: "PUBLIC_READ",
              customerAccount: "READ",   // ← enum is READ/READ_WRITE/NONE (not PUBLIC_READ)
            },
          },
        },
      }
    );
    // admin.graphql() returns a Response — must call .json() to parse it
    const createData = await createResp.json();

    if (createData.errors) {
      console.error("[ShareCart] metafieldDefinitionCreate — GraphQL errors:", JSON.stringify(createData.errors));
    }

    const createErrors =
      createData?.data?.metafieldDefinitionCreate?.userErrors ?? [];
    if (createErrors.length > 0) {
      console.log("[ShareCart] metafieldDefinitionCreate userErrors:", JSON.stringify(createErrors));
    } else if (createData?.data?.metafieldDefinitionCreate?.createdDefinition) {
      console.log("[ShareCart] metafieldDefinitionCreate: created id =", createData.data.metafieldDefinitionCreate.createdDefinition.id);
    }

    const alreadyExists = createErrors.some(
      (e) => e.code === "ALREADY_EXISTS" || e.code === "TAKEN"
    );

    // ── 2. If definition exists, patch access to add customerAccount ─────────
    // Fixes stores where the definition was previously created without
    // customerAccount: PUBLIC_READ (causing shopify.query to return null).
    // FIX: ownerType must be INSIDE MetafieldDefinitionUpdateInput — the
    // mutation only accepts `definition`, not a separate ownerType argument.
    if (alreadyExists) {
      console.debug("[ShareCart] definition already exists — patching customerAccount access");
      const updateResp = await admin.graphql(
        `mutation UpdateSharecartApiUrlAccess($def: MetafieldDefinitionUpdateInput!) {
          metafieldDefinitionUpdate(definition: $def) {
            updatedDefinition { id }
            userErrors { code field message }
          }
        }`,
        {
          variables: {
            def: {
              namespace: "sharecart",
              key: "api_url",
              ownerType: "SHOP",   // ← inside the input, not a top-level arg
              access: {
                storefront: "PUBLIC_READ",
                customerAccount: "READ",   // ← enum is READ/READ_WRITE/NONE (not PUBLIC_READ)
              },
            },
          },
        }
      );
      const updateData = await updateResp.json();
      if (updateData.errors) {
        console.error("[ShareCart] metafieldDefinitionUpdate — GraphQL errors:", JSON.stringify(updateData.errors));
      }
      const updateErrors = updateData?.data?.metafieldDefinitionUpdate?.userErrors ?? [];
      if (updateErrors.length > 0) {
        console.error("[ShareCart] metafieldDefinitionUpdate userErrors:", JSON.stringify(updateErrors));
      } else {
        console.debug("[ShareCart] metafieldDefinitionUpdate: access patched ok");
      }
    }

    // ── 3. Get shop GID ──────────────────────────────────────────────────────
    const shopResp = await admin.graphql(`{ shop { id } }`);
    const shopData = await shopResp.json(); // must call .json()
    if (shopData.errors) {
      console.error("[ShareCart] shop { id } query — GraphQL errors:", JSON.stringify(shopData.errors));
    }
    const shopId = shopData?.data?.shop?.id;
    console.debug("[ShareCart] shopId:", shopId);
    if (!shopId) return;

    // ── 4. Upsert the URL value ──────────────────────────────────────────────
    const setResp = await admin.graphql(
      `mutation SetSharecartApiUrl($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { key value }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              ownerId: shopId,
              namespace: "sharecart",
              key: "api_url",
              value: appUrl,
              type: "single_line_text_field",
            },
          ],
        },
      }
    );
    const setData = await setResp.json(); // consume response
    if (setData.errors) {
      console.error("[ShareCart] metafieldsSet — GraphQL errors:", JSON.stringify(setData.errors));
    }
    const setErrors = setData?.data?.metafieldsSet?.userErrors ?? [];
    if (setErrors.length > 0) {
      console.error("[ShareCart] metafieldsSet userErrors:", JSON.stringify(setErrors));
    } else {
      const written = setData?.data?.metafieldsSet?.metafields?.[0];
      console.debug("[ShareCart] metafield synced ok — key:", written?.key, "value:", written?.value);
    }
  } catch (err) {
    console.error("[ShareCart] syncApiUrlMetafield threw:", err?.message ?? err);
  }
}
