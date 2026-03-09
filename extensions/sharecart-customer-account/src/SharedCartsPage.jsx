// api_version 2025-10 (Remote DOM): uses document.createElement with Polaris web components.
// CLI generates: import Target from './src/SharedCartsPage.jsx';
//                shopify.extend('customer-account.page.render', (...args) => Target(...args));

/* global shopify, document */
import { el, getStatus, formatDate, formatPrice, resolveSessionToken, apiFetch as sharedApiFetch, getAppUrlSync } from './shared.js';

export default async function () {
  var _sessionToken = resolveSessionToken(arguments);

  // ── state ─────────────────────────────────────────────────────────────────
  var state = {
    loading: true,
    carts: [],
    expandedId: null,
    actionLoading: null,
    copiedId: null,
    page: 1,
    totalPages: 1,
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

  // ── API ───────────────────────────────────────────────────────────────────
  function apiFetch(path, method) {
    return sharedApiFetch(path, method, _sessionToken);
  }

  async function fetchCarts() {
    setState({ loading: true, errorMsg: '' });
    try {
      var data = await apiFetch(
        '/api/customer/share-carts?page=' + state.page + '&perPage=10'
      );
      setState({
        loading: false,
        carts: data.shareCarts || [],
        totalPages: data.totalPages || 1,
      });
    } catch (err) {
      console.error('[ShareCart] Fetch error:', err);
      setState({
        loading: false,
        errorMsg: 'Could not load shared carts. Please try refreshing the page.',
      });
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

  // ── card builder ──────────────────────────────────────────────────────────
  function buildCartCard(cart) {
    var status = getStatus(cart);
    var isExpanded = state.expandedId === cart.id;
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

    // Invisible clipboard data source — copy button references it by ID
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

    // ── Row 2: meta info — single muted line ──────────────────────────────
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

    // ── Row 3: action buttons with icons ──────────────────────────────────
    var copyBtn = el('s-button', {
      variant: 'secondary',
      command: '--copy',
      commandFor: clipId,
    },
      el('s-icon', { type: 'clipboard' }),
      isCopied ? ' Copied!' : ' Copy link'
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

    var detailsBtn = el('s-button', {
      variant: 'plain',
      onclick: function () {
        setState({ expandedId: isExpanded ? null : cartId });
      },
    },
      el('s-icon', { type: isExpanded ? 'chevron-up' : 'chevron-down' }),
      isExpanded ? ' Hide' : ' Details'
    );

    var btnItems = [copyBtn];
    if (toggleBtn) btnItems.push(toggleBtn);
    btnItems.push(deleteBtn, detailsBtn);

    var buttonRow = el('s-stack', { direction: 'inline', gap: 'small', alignItems: 'center' }, btnItems);

    // ── Expandable details section ────────────────────────────────────────
    var detailSection = null;
    if (isExpanded) {
      var parts = [];

      // Items list with thumbnails
      if (cart.items && cart.items.length > 0) {
        var itemEls = [el('s-text', { type: 'strong' }, 'Items')];

        cart.items.forEach(function (item) {
          var name = item.title || item.handle || ('Product #' + item.variantId);
          var varLabel = (item.variantTitle && item.variantTitle !== 'Default Title')
            ? ' \u2014 ' + item.variantTitle : '';
          var priceStr = item.price ? formatPrice(item.price) : '';
          var subLine = 'Qty: ' + item.quantity + (priceStr ? ' \u00b7 ' + priceStr : '');

          var rowParts = [];
          if (item.image) {
            rowParts.push(
              el('s-box', { maxInlineSize: 50, cornerRadius: 'base', overflow: 'hidden' },
                el('s-image', { source: item.image, alt: name, aspectRatio: 1, fit: 'cover' })
              )
            );
          }
          rowParts.push(
            el('s-stack', { gap: 'small-300' },
              el('s-text', {}, name + varLabel),
              el('s-text', { tone: 'subdued', type: 'small' }, subLine)
            )
          );

          itemEls.push(
            el('s-stack', { direction: 'inline', alignItems: 'center', gap: 'base' }, rowParts)
          );
        });

        parts.push(el('s-stack', { gap: 'small' }, itemEls));
      }

      // Promo codes
      if (cart.promoCodes && cart.promoCodes.length > 0) {
        var promoEls = [el('s-text', { type: 'strong' }, 'Promo code')];
        cart.promoCodes.forEach(function (p) {
          promoEls.push(el('s-badge', { tone: 'info' }, p.code));
        });
        parts.push(
          el('s-stack', { direction: 'inline', alignItems: 'center', gap: 'small' }, promoEls)
        );
      }

      // Expiry
      if (cart.expiresAt) {
        parts.push(
          el('s-text', { tone: 'subdued', type: 'small' },
            (status === 'Expired' ? 'Expired ' : 'Expires ') + formatDate(cart.expiresAt)
          )
        );
      } else if (cart.neverExpires) {
        parts.push(el('s-text', { tone: 'subdued', type: 'small' }, 'Never expires'));
      }

      // Orders placed via this cart
      if (cart.orders && cart.orders.length > 0) {
        var orderEls = [el('s-text', { type: 'strong' }, 'Orders from this cart')];
        cart.orders.forEach(function (order) {
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
          el('s-stack', { gap: 'base' },
            el('s-stack', { gap: 'small-300' },
              el('s-text', { type: 'strong' }, 'Share link'),
              el('s-text', { tone: 'subdued', type: 'small' }, cartUrl)
            ),
            el('s-box', { padding: 'base', background: 'surface', borderRadius: 'base' },
              el('s-stack', { alignItems: 'center', inlineAlignment: 'center', gap: 'small' },
                el('s-text', { type: 'strong', tone: 'subdued' }, 'Scan QR Code'),
                el('s-box', { maxInlineSize: 150 },
                  el('s-qr-code', { content: cartUrl })
                )
              )
            )
          )
        );
      }

      detailSection = el('s-box', {
        background: 'subdued',
        padding: 'base',
        borderRadius: 'base',
      },
        el('s-stack', { gap: 'base' }, parts)
      );
    }

    return el('s-section', {},
      clipItem,
      el('s-stack', { gap: 'small' },
        titleRow,
        metaRow,
        buttonRow,
        detailSection
      )
    );
  }

  // ── full UI ───────────────────────────────────────────────────────────────
  function buildUI() {
    if (state.loading) {
      return el('s-page', { title: 'Shared Carts' },
        el('s-stack', { gap: 'base' },
          el('s-text', { tone: 'subdued' }, 'Loading your shared carts\u2026')
        )
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
        el('s-stack', { gap: 'base' },
          el('s-text', { tone: 'subdued' },
            'No shared carts yet. Share your cart from the cart page to see them here.'
          )
        )
      );
    }

    var cardNodes = state.carts.map(function (cart) {
      return buildCartCard(cart);
    });

    var pagination = null;
    if (state.totalPages > 1) {
      pagination = el('s-stack', { direction: 'inline', gap: 'base', alignItems: 'center' },
        el('s-button', {
          variant: 'secondary',
          disabled: state.page <= 1,
          onclick: function () {
            state.page -= 1;
            fetchCarts();
          },
        }, 'Previous'),
        el('s-text', {}, 'Page ' + state.page + ' of ' + state.totalPages),
        el('s-button', {
          variant: 'secondary',
          disabled: state.page >= state.totalPages,
          onclick: function () {
            state.page += 1;
            fetchCarts();
          },
        }, 'Next')
      );
    }

    return el('s-page', { title: 'Shared Carts' },
      el('s-stack', { gap: 'base' },
        cardNodes,
        pagination
      )
    );
  }

  // ── bootstrap ─────────────────────────────────────────────────────────────
  rerender();
  fetchCarts();
}
