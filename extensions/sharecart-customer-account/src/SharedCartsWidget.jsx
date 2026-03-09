// api_version 2025-10 (Remote DOM): uses document.createElement with Polaris web components.
// CLI generates: import Target from './src/SharedCartsWidget.jsx';
//                shopify.extend('customer-account.profile.block.render', (...args) => Target(...args));

/* global shopify, document */
import { el, getStatus, formatDate, resolveSessionToken, apiFetch as sharedApiFetch, getAppUrlSync } from './shared.js';

export default async function () {
  var _sessionToken = resolveSessionToken(arguments);

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

  // ── API ───────────────────────────────────────────────────────────────────
  function apiFetch(path, method) {
    return sharedApiFetch(path, method, _sessionToken);
  }

  async function fetchCarts() {
    setState({ loading: true, errorMsg: '' });
    try {
      var data = await apiFetch('/api/customer/share-carts?page=1&perPage=5');
      setState({
        loading: false,
        carts: data.shareCarts || [],
      });
    } catch (err) {
      console.error('[ShareCart Widget] Fetch error:', err);
      setState({
        loading: false,
        errorMsg: 'Could not load shared carts.',
      });
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

  // ── cart card builder ─────────────────────────────────────────────────────
  function buildCartCard(cart) {
    var status = getStatus(cart);
    var isLoading = state.actionLoading === cart.id;
    var isCopied = state.copiedId === cart.id;

    var badgeTone = status === 'Active' ? 'success'
      : status === 'Expired' ? 'critical'
        : 'warning'; // Paused

    var cartId = cart.id;
    var cartUrl = cart.shareUrl;
    var cartActive = cart.isActive;
    var itemCount = cart.items ? cart.items.length : 0;
    var clipId = 'sc-clip-' + cartId;

    // Invisible clipboard data source
    var clipItem = el('s-clipboard-item', { id: clipId, text: cartUrl || '' });
    clipItem.oncopy = function () {
      setState({ copiedId: cartId });
      setTimeout(function () { setState({ copiedId: null }); }, 2000);
    };

    // ── Row 1: title + status badge ───────────────────────────────────────
    var titleRow = el('s-stack', { direction: 'inline', alignItems: 'center', gap: 'small' },
      el('s-text', { type: 'strong' }, cart.name || 'Shared Cart'),
      el('s-badge', { tone: badgeTone }, status)
    );

    // ── Row 2: meta info ──────────────────────────────────────────────────
    var metaParts = ['Created ' + formatDate(cart.createdAt)];
    if (itemCount > 0) {
      metaParts.push(itemCount + ' item' + (itemCount !== 1 ? 's' : ''));
    }
    if (cart.impressions > 0) {
      metaParts.push(cart.impressions + ' view' + (cart.impressions !== 1 ? 's' : ''));
    }
    if (cart.completedPurchases > 0) {
      metaParts.push(cart.completedPurchases + ' order' + (cart.completedPurchases !== 1 ? 's' : ''));
    }
    var metaRow = el('s-text', { tone: 'subdued', type: 'small' }, metaParts.join(' \u00b7 '));

    // ── Row 3: action buttons ─────────────────────────────────────────────
    var copyBtn = el('s-button', {
      variant: 'secondary',
      command: '--copy',
      commandFor: clipId,
    },
      el('s-icon', { type: 'clipboard' }),
      isCopied ? ' Copied!' : ' Copy'
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
      variant: 'secondary',
      tone: 'critical',
      loading: isLoading,
      onclick: function () { handleDelete(cartId); },
    },
      el('s-icon', { type: 'delete' }),
      ' Delete'
    );

    var btnItems = [copyBtn];
    if (toggleBtn) btnItems.push(toggleBtn);
    btnItems.push(deleteBtn);

    var buttonRow = el('s-stack', { direction: 'inline', gap: 'small', alignItems: 'center' }, btnItems);

    var qrCodeExpand = null;
    if (isCopied) {
      qrCodeExpand = el('s-box', { padding: 'base', background: 'subdued', borderRadius: 'base' },
        el('s-stack', { alignItems: 'center', inlineAlignment: 'center', gap: 'small' },
          el('s-text', { type: 'strong', tone: 'subdued' }, 'Scan QR Code'),
          el('s-box', { maxInlineSize: 150 },
            el('s-qr-code', { content: cartUrl })
          )
        )
      );
    }

    // ── Wrap in section card ──────────────────────────────────────────────
    return el('s-box', {
      padding: 'base',
      border: 'base',
      borderRadius: 'base',
      background: 'surface'
    },
      el('s-section', {},
        clipItem,
        el('s-stack', { gap: 'small' },
          titleRow,
          metaRow,
          buttonRow,
          qrCodeExpand
        )
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

    var cartCards = state.carts.map(function (cart) {
      return buildCartCard(cart);
    });

    return el('s-stack', { gap: 'base' },
      el('s-text', { type: 'strong' }, 'Shared Carts'),
      el('s-grid', {
        columns: { base: ['1fr'], sm: ['1fr', '1fr'], md: ['1fr', '1fr', '1fr'] },
        gap: 'base'
      }, cartCards)
    );
  }

  // ── bootstrap ─────────────────────────────────────────────────────────────
  rerender();
  fetchCarts();
}
