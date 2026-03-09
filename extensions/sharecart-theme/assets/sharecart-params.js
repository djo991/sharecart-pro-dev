(function () {
  'use strict';

  var STORAGE_KEY = '__sc_params';
  var STORAGE_TTL = 30 * 60 * 1000; // 30 minutes

  /**
   * Step 1: Capture tracking params from the current URL and store them.
   * This runs on every page load. If the URL has tracking params,
   * they're saved to localStorage (or sessionStorage as fallback)
   * so they survive Shopify's /cart/add redirect which strips all query params.
   *
   * Two modes:
   *  A) Share-link visit (_sc param present):
   *     Capture ALL query params — these include merchant-defined
   *     params appended by the URL Parameter Engine.
   *  B) Normal visit (no _sc param):
   *     Capture only known tracking prefixes (utm_, fbclid, gclid, etc.)
   *     plus any merchant-defined keys from window.__sharecart.paramKeys.
   */
  function captureParams() {
    var params = new URLSearchParams(window.location.search);
    var captured = {};

    var isShareLink = params.has('_sc');

    if (isShareLink) {
      // ── Mode A: Share-link visit — capture ALL params ──
      params.forEach(function (value, key) {
        // Skip the share token itself (handled by sharecart-restore.js)
        if (key === '_sc') return;
        captured[key] = value;
      });
    } else {
      // ── Mode B: Normal visit — capture known tracking params only ──
      var trackingPrefixes = ['utm_', 'ref', 'affid', 'fbclid', 'gclid', 'ttclid', 'msclkid'];

      params.forEach(function (value, key) {
        var isTracking = trackingPrefixes.some(function (p) {
          return key.startsWith(p) || key === p;
        });
        if (isTracking) {
          captured[key] = value;
        }
      });

      // Also capture merchant-defined custom param keys (injected by Liquid)
      var merchantKeys = (window.__sharecart && window.__sharecart.paramKeys) || [];
      merchantKeys.forEach(function (key) {
        if (params.has(key)) {
          captured[key] = params.get(key);
        }
      });
    }

    if (Object.keys(captured).length === 0) return;

    var payload = JSON.stringify({
      params: captured,
      ts: Date.now()
    });

    try {
      localStorage.setItem(STORAGE_KEY, payload);
    } catch (e) {
      // Safari ITP / private browsing: fall back to sessionStorage
      try {
        sessionStorage.setItem(STORAGE_KEY, payload);
      } catch (e2) {
        // Storage completely blocked — params will be lost
      }
    }
  }

  /**
   * Step 2: After a redirect lands on /cart, read stored params
   * and write them to Shopify cart attributes via /cart/update.js.
   * This ensures the params survive all the way to checkout and the order.
   */
  function writeParamsToCart() {
    // Only write on the cart page (where redirect lands after /cart/add)
    if (window.location.pathname !== '/cart') return;

    var stored;
    try {
      var raw =
        localStorage.getItem(STORAGE_KEY) ||
        sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      stored = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (!stored || !stored.params) return;

    // Check TTL — don't write stale params from a previous session
    if (Date.now() - stored.ts > STORAGE_TTL) {
      cleanup();
      return;
    }

    // Prefix all params with _sc_ to avoid collisions with other apps.
    // Attributes prefixed with _ are hidden from customers in Shopify's UI.
    var attributes = {};
    Object.keys(stored.params).forEach(function (key) {
      // Don't double-prefix if already prefixed
      var attrKey = key.startsWith('_sc_') ? key : '_sc_' + key;
      attributes[attrKey] = stored.params[key];
    });

    fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributes: attributes })
    })
      .then(function () {
        console.debug('[ShareCart] Params written to cart attributes:', attributes);
        cleanup();
      })
      .catch(function () {
        // Silently fail — don't block the customer experience
      });
  }

  /**
   * Clear stored params after successful write or on TTL expiry.
   */
  function cleanup() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { }
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { }
  }

  // Run both steps on every page load
  captureParams();
  writeParamsToCart();
})();
