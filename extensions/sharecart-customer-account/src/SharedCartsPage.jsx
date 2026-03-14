// api_version 2025-10 (Remote DOM): uses document.createElement with Polaris web components.
// CLI generates: import Target from './src/SharedCartsPage.jsx';
//                shopify.extend('customer-account.page.render', (...args) => Target(...args));

/* global shopify, document */

export default async function () {
  // ── resolve session-token API ─────────────────────────────────────────────
  var _sessionToken = (typeof shopify !== 'undefined' && shopify.sessionToken)
    ? shopify.sessionToken
    : null;

  if (!_sessionToken) {
    for (var i = 0; i < arguments.length; i++) {
      var arg = arguments[i];
      if (arg && typeof arg === 'object' && arg.sessionToken) {
        _sessionToken = arg.sessionToken;
        break;
      }
    }
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function el(tag, props) {
    var node = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    if (props) {
      for (var key in props) {
        if (!props.hasOwnProperty(key)) continue;
        var val = props[key];
        if (val != null && val !== false) node[key] = val;
      }
    }
    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, list) {
    for (var i = 0; i < list.length; i++) {
      var child = list[i];
      if (child == null || child === false || child === true) continue;
      if (Array.isArray(child)) { appendChildren(node, child); continue; }
      if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else {
        node.appendChild(child);
      }
    }
  }

  // ── state ─────────────────────────────────────────────────────────────────
  var state = {
    loading: true,
    carts: [],
    errorMsg: '',
    expandedId: null,
    actionLoading: null,
    copiedId: null,
    page: 1,
    totalPages: 1,
    // Lazy-loaded detail data (orders) keyed by cart id
    detailData: {},
    detailLoading: null,
  };

  function setState(patch) {
    Object.assign(state, patch);
    rerender();
  }

  function rerender() {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    document.body.appendChild(buildUI());
  }

  // ── URL resolution ────────────────────────────────────────────────────────
  var _appUrl = '';
  try { _appUrl = (process.env.SHOPIFY_APP_URL || '').replace(/\/+$/, ''); } catch (e) {}

  var _bootstrapAttempted = false;

  async function ensureAppUrl() {
    if (_appUrl) return;
    if (_bootstrapAttempted) return;
    _bootstrapAttempted = true;
    try {
      if (typeof shopify === 'undefined' || typeof shopify.query !== 'function') return;
      var result = await shopify.query(
        '{shop{metafield(namespace:"sharecart",key:"api_url"){value}}}'
      );
      var val = result?.data?.shop?.metafield?.value;
      if (val) _appUrl = val.replace(/\/+$/, '');
    } catch (_) {}
  }

  // ── API ───────────────────────────────────────────────────────────────────
  async function apiFetch(path, method) {
    if (!_sessionToken) throw new Error('No session token API available');
    var token = await _sessionToken.get();
    await ensureAppUrl();
    if (!_appUrl) throw new Error('Could not determine API URL');
    var res = await fetch(_appUrl + path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function fetchCarts() {
    setState({ loading: true, errorMsg: '' });
    try {
      var data = await apiFetch('/api/customer/share-carts?page=' + state.page + '&perPage=10');
      setState({ loading: false, carts: data.shareCarts || [], totalPages: data.totalPages || 1 });
    } catch (err) {
      console.error('[ShareCart] Fetch error:', err);
      setState({ loading: false, errorMsg: 'Could not load shared carts. Please try refreshing.' });
    }
  }

  // Lazily fetch full cart detail (including orders) when a card is expanded.
  async function fetchDetail(cartId) {
    if (state.detailData[cartId]) return; // already loaded
    setState({ detailLoading: cartId });
    try {
      var detail = await apiFetch('/api/customer/share-carts/' + cartId);
      var next = Object.assign({}, state.detailData);
      next[cartId] = detail;
      setState({ detailData: next, detailLoading: null });
    } catch (err) {
      console.error('[ShareCart] Detail fetch error:', err);
      setState({ detailLoading: null });
    }
  }

  async function handleToggle(id) {
    setState({ actionLoading: id });
    try {
      await apiFetch('/api/customer/share-carts/' + id + '/toggle', 'PATCH');
      await fetchCarts();
    } catch (err) {
      console.error('[ShareCart] Toggle error:', err);
    } finally {
      setState({ actionLoading: null });
    }
  }

  async function handleDelete(id) {
    setState({ actionLoading: id });
    try {
      await apiFetch('/api/customer/share-carts/' + id, 'DELETE');
      await fetchCarts();
    } catch (err) {
      console.error('[ShareCart] Delete error:', err);
    } finally {
      setState({ actionLoading: null });
    }
  }

  function handleExpand(cartId) {
    var nextExpanded = state.expandedId === cartId ? null : cartId;
    setState({ expandedId: nextExpanded });
    if (nextExpanded) fetchDetail(cartId);
  }

  // ── formatting helpers ────────────────────────────────────────────────────
  function getStatus(cart) {
    if (!cart.isActive) return 'Paused';
    if (cart.expiresAt && new Date(cart.expiresAt) < new Date()) return 'Expired';
    return 'Active';
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatPrice(cents) {
    if (cents == null) return '';
    return '$' + (cents / 100).toFixed(2);
  }

  // ── card builder ──────────────────────────────────────────────────────────
  function buildCartCard(cart) {
    var status     = getStatus(cart);
    var isExpanded = state.expandedId === cart.id;
    var isLoading  = state.actionLoading === cart.id;
    var isCopied   = state.copiedId === cart.id;

    var badgeTone = status === 'Active' ? 'success' : status === 'Expired' ? 'critical' : 'warning';

    var cartId     = cart.id;
    var cartUrl    = cart.shareUrl;
    var cartActive = cart.isActive;
    var itemCount  = cart.items ? cart.items.length : 0;
    var clipId     = 'sc-clip-' + cartId;

    // Invisible clipboard data source
    var clipItem = el('s-clipboard-item', { id: clipId, text: cartUrl || '' });
    clipItem.oncopy = function () {
      setState({ copiedId: cartId });
      setTimeout(function () { setState({ copiedId: null }); }, 2000);
    };

    // Row 1: title + status badge
    var titleRow = el('s-stack', { direction: 'inline', alignItems: 'center', gap: 'small' },
      el('s-text', { type: 'strong' }, cart.name || 'Shared Cart'),
      el('s-badge', { tone: badgeTone }, status)
    );

    // Row 2: meta info
    var metaParts = ['Created ' + formatDate(cart.createdAt)];
    if (itemCount > 0) metaParts.push(itemCount + ' item' + (itemCount !== 1 ? 's' : ''));
    if (cart.impressions > 0) metaParts.push(cart.impressions + ' view' + (cart.impressions !== 1 ? 's' : ''));
    if (cart.completedPurchases > 0) metaParts.push(cart.completedPurchases + ' order' + (cart.completedPurchases !== 1 ? 's' : ''));
    var metaRow = el('s-text', { tone: 'subdued', type: 'small' }, metaParts.join(' \u00b7 '));

    // Row 3: action buttons
    var copyBtn = el('s-button', { variant: 'secondary', command: '--copy', commandFor: clipId },
      el('s-icon', { type: 'clipboard' }), isCopied ? ' Copied!' : ' Copy link'
    );

    var toggleBtn = null;
    if (status !== 'Expired') {
      toggleBtn = el('s-button', {
        variant: 'secondary',
        loading: isLoading,
        onclick: function () { handleToggle(cartId); },
      }, cartActive ? 'Pause' : 'Resume');
    }

    var deleteBtn = el('s-button', {
      variant: 'secondary', tone: 'critical', loading: isLoading,
      onclick: function () { handleDelete(cartId); },
    }, el('s-icon', { type: 'delete' }), ' Delete');

    var detailsBtn = el('s-button', {
      variant: 'plain',
      onclick: function () { handleExpand(cartId); },
    }, el('s-icon', { type: isExpanded ? 'chevron-up' : 'chevron-down' }), isExpanded ? ' Hide' : ' Details');

    var btnItems = [copyBtn];
    if (toggleBtn) btnItems.push(toggleBtn);
    btnItems.push(deleteBtn, detailsBtn);

    var buttonRow = el('s-stack', { direction: 'inline', gap: 'small', alignItems: 'center' }, btnItems);

    // Expandable details section (orders lazy-loaded)
    var detailSection = null;
    if (isExpanded) {
      var parts = [];
      var detail = state.detailData[cartId]; // may be undefined while loading

      // Items (available from list data)
      if (cart.items && cart.items.length > 0) {
        var itemEls = [el('s-text', { type: 'strong' }, 'Items')];
        cart.items.forEach(function (item) {
          var name     = item.title || item.handle || ('Product #' + item.variantId);
          var varLabel = (item.variantTitle && item.variantTitle !== 'Default Title') ? ' \u2014 ' + item.variantTitle : '';
          var priceStr = item.price ? formatPrice(item.price) : '';
          var subLine  = 'Qty: ' + item.quantity + (priceStr ? ' \u00b7 ' + priceStr : '');
          var rowParts = [];
          if (item.image) rowParts.push(el('s-thumbnail', { source: item.image, size: 'small', alt: name }));
          rowParts.push(
            el('s-stack', { gap: 'small-300' },
              el('s-text', {}, name + varLabel),
              el('s-text', { tone: 'subdued', type: 'small' }, subLine)
            )
          );
          itemEls.push(el('s-stack', { direction: 'inline', alignItems: 'center', gap: 'base' }, rowParts));
        });
        parts.push(el('s-stack', { gap: 'small' }, itemEls));
      }

      // Promo codes (available from list data)
      if (cart.promoCodes && cart.promoCodes.length > 0) {
        var promoEls = [el('s-text', { type: 'strong' }, 'Promo code')];
        cart.promoCodes.forEach(function (p) { promoEls.push(el('s-badge', { tone: 'info' }, p.code)); });
        parts.push(el('s-stack', { direction: 'inline', alignItems: 'center', gap: 'small' }, promoEls));
      }

      // Expiry
      if (cart.expiresAt) {
        parts.push(el('s-text', { tone: 'subdued', type: 'small' },
          (status === 'Expired' ? 'Expired ' : 'Expires ') + formatDate(cart.expiresAt)));
      } else if (cart.neverExpires) {
        parts.push(el('s-text', { tone: 'subdued', type: 'small' }, 'Never expires'));
      }

      // Orders — lazy-loaded from detail endpoint
      if (state.detailLoading === cartId) {
        parts.push(el('s-text', { tone: 'subdued', type: 'small' }, 'Loading orders\u2026'));
      } else if (detail && detail.orders && detail.orders.length > 0) {
        var orderEls = [el('s-text', { type: 'strong' }, 'Orders from this cart')];
        detail.orders.forEach(function (order) {
          var lineParts = [order.shopifyOrderName || order.shopifyOrderId];
          if (order.orderValue != null) lineParts.push('$' + order.orderValue.toFixed(2));
          lineParts.push(formatDate(order.createdAt));
          orderEls.push(el('s-text', { type: 'small' }, lineParts.join(' \u00b7 ')));
        });
        parts.push(el('s-stack', { gap: 'small-200' }, orderEls));
      }

      // Share URL
      if (cartUrl) {
        parts.push(
          el('s-stack', { gap: 'small-300' },
            el('s-text', { type: 'strong' }, 'Share link'),
            el('s-text', { tone: 'subdued', type: 'small' }, cartUrl)
          )
        );
      }

      detailSection = el('s-box', { background: 'subdued', padding: 'base', borderRadius: 'base' },
        el('s-stack', { gap: 'base' }, parts)
      );
    }

    return el('s-section', {},
      clipItem,
      el('s-stack', { gap: 'small' }, titleRow, metaRow, buttonRow, detailSection)
    );
  }

  // ── full UI ───────────────────────────────────────────────────────────────
  function buildUI() {
    if (state.loading) {
      return el('s-page', { title: 'Shared Carts' },
        el('s-text', { tone: 'subdued' }, 'Loading your shared carts\u2026')
      );
    }

    if (state.errorMsg) {
      return el('s-page', { title: 'Shared Carts' },
        el('s-banner', { tone: 'critical', title: 'Error loading carts' },
          el('s-text', {}, state.errorMsg)
        )
      );
    }

    if (state.carts.length === 0) {
      return el('s-page', { title: 'Shared Carts' },
        el('s-text', { tone: 'subdued' }, 'No shared carts yet. Share your cart from the cart page to see them here.')
      );
    }

    var pagination = null;
    if (state.totalPages > 1) {
      pagination = el('s-stack', { direction: 'inline', gap: 'base', alignItems: 'center' },
        el('s-button', {
          variant: 'secondary', disabled: state.page <= 1,
          onclick: function () { state.page -= 1; fetchCarts(); },
        }, 'Previous'),
        el('s-text', {}, 'Page ' + state.page + ' of ' + state.totalPages),
        el('s-button', {
          variant: 'secondary', disabled: state.page >= state.totalPages,
          onclick: function () { state.page += 1; fetchCarts(); },
        }, 'Next')
      );
    }

    return el('s-page', { title: 'Shared Carts' },
      el('s-stack', { gap: 'base' },
        state.carts.map(function (cart) { return buildCartCard(cart); }),
        pagination
      )
    );
  }

  // ── bootstrap ─────────────────────────────────────────────────────────────
  rerender();
  fetchCarts();
}
