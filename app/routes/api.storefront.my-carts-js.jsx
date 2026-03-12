import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * App proxy endpoint: /apps/sharecart/api/storefront/my-carts-js
 *
 * Serves the sharecart-account.js file as a JavaScript asset.
 * This avoids the issue where {{ asset_url }} doesn't resolve
 * theme extension assets within app proxy Liquid responses.
 */
let _cachedJS = null;

export const loader = async () => {
  // Read the JS file from the theme extension assets (cached after first read)
  if (!_cachedJS) {
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const jsPath = join(
        __dirname,
        "..",
        "..",
        "extensions",
        "sharecart-theme",
        "assets",
        "sharecart-account.js"
      );
      _cachedJS = readFileSync(jsPath, "utf8");
    } catch (err) {
      console.error("[my-carts-js] Failed to read JS file:", err);
      _cachedJS = "console.error('[ShareCart] Failed to load script');";
    }
  }

  return new Response(_cachedJS, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
