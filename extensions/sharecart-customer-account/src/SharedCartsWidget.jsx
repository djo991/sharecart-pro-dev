// api_version 2025-10 (Remote DOM): uses document.createElement with Polaris web components.
// CLI generates: import Target from './src/SharedCartsWidget.jsx';
//                shopify.extend('customer-account.profile.block.render', (...args) => Target(...args));

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
    actionLoading: null,
    copiedId: null,
  };

  function setState(patch) {
    Object.assign(state, patch);
    rerender();
  }

  function rerender() {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    var ui = buildUI();
    if (ui) document.body.appendChild(ui);
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
      var data = await apiFetch('/api/customer/share-carts?page=1&perPage=5');
      setState({ loading: false, carts: data.shareCarts || [] });
    } catch (err) {
      console.error('[ShareCart Widget] Fetch error:', err);
      setState({ loading: false, errorMsg: 'Could not load shared carts.' });
    }
  }

  async function handleToggle(id) {
    setState({ actionLoading: id });
    try {
      await apiFetch('/api/customer/share-carts/' + id + '/toggle', 'PATCH');
      await fetchCarts();
    } catch (err) {
      console.error('[ShareCart Widget] Toggle error:', err);
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
      console.error('[ShareCart Widget] Delete error:', err);
    } finally {
      setState({ actionLoading: null });
    }
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

  // ── cart card builder ─────────────────────────────────────────────────────
  function buildCartCard(cart) {
    var status    = getStatus(cart);
    var isLoading = state.actionLoading === cart.id;
    var isCopied  = state.copiedId === cart.id;

    var badgeTone = status === 'Active' ? 'success' : status === 'Expired' ? 'critical' : 'warning';

    var cartId     = cart.id;
    var cartUrl    = cart.shareUrl;
    var cartActive = cart.isActive;
    var itemCount  = cart.items ? cart.items.length : 0;
    var clipId     = 'sc-clip-' + cartId;

    var clipItem = el('s-clipboard-item', { id: clipId, text: cartUrl || '' });
    clipItem.oncopy = function () {
      setState({ copiedId: cartId });
      setTimeout(function () { setState({ copiedId: null }); }, 2000);
    };

    // Row 1: title + badge
    var titleRow = el('s-stack', { direction: 'inline', alignItems: 'center', gap: 'small' },
      el('s-text', { type: 'strong' }, cart.name || 'Shared Cart'),
      el('s-badge', { tone: badgeTone }, status)
    );

    // Row 2: meta
    var metaParts = ['Created ' + formatDate(cart.createdAt)];
    if (itemCount > 0) metaParts.push(itemCount + ' item' + (itemCount !== 1 ? 's' : ''));
    if (cart.impressions > 0) metaParts.push(cart.impressions + ' view' + (cart.impressions !== 1 ? 's' : ''));
    if (cart.completedPurchases > 0) metaParts.push(cart.completedPurchases + ' order' + (cart.completedPurchases !== 1 ? 's' : ''));
    var metaRow = el('s-text', { tone: 'subdued', type: 'small' }, metaParts.join(' \u00b7 '));

    // Row 3: action buttons
    var copyBtn = el('s-button', { variant: 'secondary', command: '--copy', commandFor: clipId },
      el('s-icon', { type: 'clipboard' }), isCopied ? ' Copied!' : ' Copy'
    );

    var toggleBtn = null;
    if (status !== 'Expired') {
      toggleBtn = el('s-button', {
        variant: 'secondary', loading: isLoading,
        onclick: function () { handleToggle(cartId); },
      }, cartActive ? 'Pause' : 'Resume');
    }

    var deleteBtn = el('s-button', {
      variant: 'secondary', tone: 'critical', loading: isLoading,
      onclick: function () { handleDelete(cartId); },
    }, el('s-icon', { type: 'delete' }), ' Delete');

    var btnItems = [copyBtn];
    if (toggleBtn) btnItems.push(toggleBtn);
    btnItems.push(deleteBtn);

    return el('s-section', {},
      clipItem,
      el('s-stack', { gap: 'small' },
        titleRow,
        metaRow,
        el('s-stack', { direction: 'inline', gap: 'small', alignItems: 'center' }, btnItems)
      )
    );
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  function buildUI() {
    if (state.loading) {
      return el('s-stack', { gap: 'base' },
        el('s-text', { type: 'strong' }, 'Shared Carts'),
        el('s-text', { tone: 'subdued' }, 'Loading\u2026')
      );
    }

    if (state.errorMsg) {
      return el('s-stack', { gap: 'base' },
        el('s-text', { type: 'strong' }, 'Shared Carts'),
        el('s-text', { tone: 'subdued' }, state.errorMsg)
      );
    }

    if (state.carts.length === 0) {
      return el('s-stack', { gap: 'base' },
        el('s-text', { type: 'strong' }, 'Shared Carts'),
        el('s-text', { tone: 'subdued' }, 'No shared carts yet.')
      );
    }

    return el('s-stack', { gap: 'base' },
      el('s-text', { type: 'strong' }, 'Shared Carts'),
      state.carts.map(function (cart) { return buildCartCard(cart); })
    );
  }

  // ── bootstrap ─────────────────────────────────────────────────────────────
  rerender();
  fetchCarts();
}
