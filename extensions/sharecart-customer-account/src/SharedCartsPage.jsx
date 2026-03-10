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
    var titleRow = el('s-stack', { direction: 'inline', alignItems: 'center', inlineAlignment: 'space-between', blockAlignment: 'start', minInlineSize: '100%' },
      el('s-stack', { direction: 'column', gap: 'small-300' },
        el('s-text', { type: 'strong', size: 'large' }, cart.name || 'Shared Cart'),
        el('s-text', { tone: 'subdued', type: 'small' }, 'Created ' + formatDate(cart.createdAt))
      ),
      el('s-badge', { tone: badgeTone }, status)
    );

    // ── Row 2: Metrics Block ──────────────────────────────
    var metricsParts = [];
    if (itemCount > 0) {
      metricsParts.push(
        el('s-stack', { direction: 'column', gap: 'small-300' },
          el('s-text', { type: 'strong', size: 'large' }, itemCount),
          el('s-text', { tone: 'subdued', type: 'small' }, 'Items')
        )
      );
    }
    if (cart.impressions > 0) {
      metricsParts.push(
        el('s-stack', { direction: 'column', gap: 'small-300' },
          el('s-text', { type: 'strong', size: 'large' }, cart.impressions),
          el('s-text', { tone: 'subdued', type: 'small' }, 'Views')
        )
      );
    }
    if (cart.completedPurchases > 0) {
      metricsParts.push(
        el('s-stack', { direction: 'column', gap: 'small-300' },
          el('s-text', { type: 'strong', size: 'large' }, cart.completedPurchases),
          el('s-text', { tone: 'subdued', type: 'small' }, 'Orders')
        )
      );
    }

    var metricsBlock = null;
    if (metricsParts.length > 0) {
      metricsBlock = el('s-box', {
        background: 'subdued',
        padding: 'base',
        cornerRadius: 'base',
      },
        el('s-stack', { direction: 'inline', gap: 'base', wrap: 'wrap' }, metricsParts)
      );
    }

    // ── Row 3: action buttons with icons ──────────────────────────────────
    var copyBtn = el('s-button', {
      variant: 'primary', // Make this primary to stand out
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
      variant: 'secondary',
      onclick: function () {
        setState({ expandedId: isExpanded ? null : cartId });
      },
    },
      el('s-icon', { type: isExpanded ? 'chevron-up' : 'chevron-down' }),
      isExpanded ? ' Hide' : ' Details'
    );

    var btnGroupMain = [copyBtn];
    if (toggleBtn) btnGroupMain.push(toggleBtn);

    // Group primary actions on left, destructive/details on right
    var buttonRow = el('s-stack', { direction: 'inline', inlineAlignment: 'space-between', minInlineSize: '100%', gap: 'small', wrap: 'wrap' },
      el('s-stack', { direction: 'inline', gap: 'small' }, btnGroupMain),
      el('s-stack', { direction: 'inline', gap: 'small' }, [detailsBtn, deleteBtn])
    );

    // ── Expandable details section ────────────────────────────────────────
    var detailSection = null;
    if (isExpanded) {
      var parts = [];

      // Items list with thumbnails
      if (cart.items && cart.items.length > 0) {
        var itemEls = [el('s-text', { type: 'strong' }, 'Cart Contents')];

        cart.items.forEach(function (item) {
          var name = item.title || item.handle || ('Product #' + item.variantId);
          var varLabel = (item.variantTitle && item.variantTitle !== 'Default Title')
            ? ' \u2014 ' + item.variantTitle : '';
          var priceStr = item.price ? formatPrice(item.price) : '';
          var subLine = 'Qty: ' + item.quantity + (priceStr ? ' \u00b7 ' + priceStr : '');

          var rowParts = [];
          if (item.image) {
            rowParts.push(
              el('s-box', { maxInlineSize: 40, cornerRadius: 'base', overflow: 'hidden' },
                el('s-image', { source: item.image, alt: name, aspectRatio: 1, fit: 'cover' })
              )
            );
          }
          rowParts.push(
            el('s-stack', { direction: 'column', gap: 'small-100' },
              el('s-text', { type: 'strong' }, name + varLabel),
              el('s-text', { tone: 'subdued', type: 'small' }, subLine)
            )
          );

          itemEls.push(
            el('s-box', { paddingBlockStart: 'small', paddingBlockEnd: 'small', borderBlockEnd: 'base' },
              el('s-stack', { direction: 'inline', alignItems: 'center', gap: 'base' }, rowParts)
            )
          );
        });

        parts.push(el('s-stack', { direction: 'column', gap: 'small' }, itemEls));
      }

      // Metadata section (Promo / Expiry / Link)
      var metaBoxParts = [];

      // Promo codes
      if (cart.promoCodes && cart.promoCodes.length > 0) {
        var promoEls = [el('s-text', { type: 'strong' }, 'Promo code')];
        cart.promoCodes.forEach(function (p) {
          promoEls.push(el('s-badge', { tone: 'info' }, p.code));
        });
        metaBoxParts.push(
          el('s-stack', { direction: 'inline', alignItems: 'center', gap: 'small' }, promoEls)
        );
      }

      // Expiry
      if (cart.expiresAt) {
        metaBoxParts.push(
          el('s-text', { tone: 'subdued', type: 'small' },
            (status === 'Expired' ? 'Expired ' : 'Expires ') + formatDate(cart.expiresAt)
          )
        );
      } else if (cart.neverExpires) {
        metaBoxParts.push(el('s-text', { tone: 'subdued', type: 'small' }, 'Never expires'));
      }

      // Share URL & QR
      if (cartUrl) {
        metaBoxParts.push(
          el('s-stack', { direction: 'column', gap: 'base' },
            el('s-stack', { direction: 'column', gap: 'small-300' },
              el('s-text', { type: 'strong' }, 'Share link URL'),
              el('s-text', { tone: 'subdued', type: 'small' }, cartUrl)
            ),
            el('s-box', { padding: 'base', background: 'surface', cornerRadius: 'base', border: 'base' },
              el('s-stack', { direction: 'column', alignItems: 'center', gap: 'small' },
                el('s-text', { type: 'strong', tone: 'subdued' }, 'Scan QR Code'),
                el('s-box', { maxInlineSize: 150 },
                  el('s-qr-code', { content: cartUrl })
                )
              )
            )
          )
        );
      }

      if (metaBoxParts.length > 0) {
        parts.push(el('s-stack', { direction: 'column', gap: 'base', minInlineSize: '100%' }, metaBoxParts));
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
        parts.push(
          el('s-box', { background: 'surface', padding: 'base', cornerRadius: 'base', border: 'base' },
            el('s-stack', { direction: 'column', gap: 'small-200' }, orderEls)
          )
        );
      }

      detailSection = el('s-box', {
        background: 'subdued',
        padding: 'base',
        cornerRadius: 'base',
        minInlineSize: '100%',
        marginBlockStart: 'base'
      },
        el('s-stack', { direction: 'column', gap: 'base' }, parts)
      );
    }

    var cardParams = [
      clipItem,
      el('s-stack', { direction: 'column', gap: 'base', minInlineSize: '100%' },
        titleRow,
        metricsBlock,
        buttonRow,
        detailSection
      )
    ];

    // Filter out nulls (like metricsBlock if empty)
    cardParams = cardParams.filter(Boolean);

    return el('s-box', {
      border: 'base',
      cornerRadius: 'base',
      padding: 'base',
      background: 'default',
      minInlineSize: '100%',
    }, ...cardParams);
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
        el('s-banner', {
          title: 'No shared carts yet',
          status: 'info',
        },
          el('s-text', { tone: 'subdued' },
            'Build a cart while browsing the store and click the share button to get started. Your shared carts will appear here for you to manage.'
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
