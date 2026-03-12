// api_version 2025-10 (Remote DOM): uses document.createElement with standard HTML elements.
// CLI generates: import Target from './src/SharedCartsPage.jsx';
//                shopify.extend('customer-account.page.render', (...args) => Target(...args));

/* global shopify, document */
import { el, getStatus, formatDate, formatPrice, resolveSessionToken, apiFetch as sharedApiFetch } from './shared.js';

export default async function () {
  var _sessionToken = resolveSessionToken(arguments);

  // ── inject CSS ─────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = getCSS();
  document.body.appendChild(style);

  // ── state ──────────────────────────────────────────────────────────────────
  var state = {
    loading: true,
    carts: [],
    errorMsg: '',
    actionLoading: null,
    copiedId: null,
    page: 1,
    totalPages: 1,
    searchQuery: '',
    // Router: 'dashboard' or 'detail'
    currentView: 'dashboard',
    detailCartId: null,
  };

  function setState(patch) {
    Object.assign(state, patch);
    rerender();
  }

  function rerender() {
    // keep the <style> tag, remove everything else
    var children = Array.prototype.slice.call(document.body.childNodes);
    for (var i = 0; i < children.length; i++) {
      if (children[i] !== style) {
        document.body.removeChild(children[i]);
      }
    }
    document.body.appendChild(buildUI());
  }

  // ── API ────────────────────────────────────────────────────────────────────
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
      // If we were viewing that cart's details, go back to dashboard
      if (state.currentView === 'detail' && state.detailCartId === id) {
        setState({ currentView: 'dashboard', detailCartId: null });
      }
      await fetchCarts();
    } catch (err) {
      console.error('[ShareCart] Delete error:', err);
    } finally {
      setState({ actionLoading: null });
    }
  }

  function handleCopy(cartUrl, cartId) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cartUrl).then(function () {
        setState({ copiedId: cartId });
        setTimeout(function () { setState({ copiedId: null }); }, 2000);
      });
    }
  }

  function navigateToDetail(cartId) {
    setState({ currentView: 'detail', detailCartId: cartId });
  }

  function navigateToDashboard() {
    setState({ currentView: 'dashboard', detailCartId: null });
  }

  // ── SVG icon helpers ──────────────────────────────────────────────────────
  function svgIcon(pathD, size) {
    var sz = size || 18;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(sz));
    svg.setAttribute('height', String(sz));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
  }

  var ICONS = {
    copy: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M8 2h8v4H8z',
    pause: 'M10 4H6v16h4V4z M18 4h-4v16h4V4z',
    play: 'M5 3l14 9-14 9V3z',
    trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6',
    details: 'M9 18l6-6-6-6',
    back: 'M15 18l-6-6 6-6',
    search: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M21 21l-4.35-4.35',
    check: 'M20 6L9 17l-5-5',
    link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  };

  function icon(name, size) {
    return svgIcon(ICONS[name] || '', size);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DASHBOARD VIEW
  // ══════════════════════════════════════════════════════════════════════════
  function buildDashboard() {
    var container = el('div', { className: 'sc-dashboard' });

    // ── Header ──────────────────────────────────────────────────────────────
    var header = el('div', { className: 'sc-header' },
      el('div', {},
        el('h2', { className: 'sc-title' }, 'Shared Carts'),
        el('p', { className: 'sc-subtitle' }, 'Manage and track your shared shopping links.')
      )
    );
    container.appendChild(header);

    // ── Search / Filter Bar ─────────────────────────────────────────────────
    var searchInput = el('input', {
      type: 'text',
      className: 'sc-search-input',
      placeholder: 'Search carts...',
      value: state.searchQuery,
    });
    searchInput.addEventListener('input', function (e) {
      state.searchQuery = e.target.value;
      rerender();
    });

    var searchBar = el('div', { className: 'sc-search-bar' },
      el('div', { className: 'sc-search-icon' }, icon('search', 16)),
      searchInput
    );
    container.appendChild(searchBar);

    // ── Filter carts ────────────────────────────────────────────────────────
    var filteredCarts = state.carts;
    if (state.searchQuery.trim()) {
      var q = state.searchQuery.trim().toLowerCase();
      filteredCarts = state.carts.filter(function (c) {
        return (c.name || '').toLowerCase().indexOf(q) !== -1;
      });
    }

    // ── Card Grid ───────────────────────────────────────────────────────────
    if (filteredCarts.length === 0 && !state.searchQuery.trim()) {
      container.appendChild(
        el('div', { className: 'sc-empty' },
          el('h3', {}, 'No shared carts yet'),
          el('p', {}, 'Build a cart while browsing the store and click the share button to get started.')
        )
      );
    } else if (filteredCarts.length === 0) {
      container.appendChild(
        el('div', { className: 'sc-empty' },
          el('p', {}, 'No carts matching "' + state.searchQuery + '"')
        )
      );
    } else {
      var grid = el('div', { className: 'sc-grid' });
      filteredCarts.forEach(function (cart) {
        grid.appendChild(buildCartCard(cart));
      });
      container.appendChild(grid);
    }

    // ── Pagination ──────────────────────────────────────────────────────────
    if (state.totalPages > 1) {
      var prevBtn = el('button', {
        className: 'sc-btn sc-btn-outline',
        disabled: state.page <= 1,
        onclick: function () { state.page -= 1; fetchCarts(); },
      }, 'Previous');

      var nextBtn = el('button', {
        className: 'sc-btn sc-btn-outline',
        disabled: state.page >= state.totalPages,
        onclick: function () { state.page += 1; fetchCarts(); },
      }, 'Next');

      container.appendChild(
        el('div', { className: 'sc-pagination' },
          prevBtn,
          el('span', { className: 'sc-page-info' }, 'Page ' + state.page + ' of ' + state.totalPages),
          nextBtn
        )
      );
    }

    return container;
  }

  // ── Card Builder ──────────────────────────────────────────────────────────
  function buildCartCard(cart) {
    var status = getStatus(cart);
    var isLoading = state.actionLoading === cart.id;
    var isCopied = state.copiedId === cart.id;
    var isPaused = status === 'Paused';
    var isExpired = status === 'Expired';
    var itemCount = cart.items ? cart.items.length : 0;

    var badgeClass = 'sc-badge ' + (
      status === 'Active' ? 'sc-badge-active' :
      status === 'Paused' ? 'sc-badge-paused' :
      'sc-badge-expired'
    );

    var cardClass = 'sc-card' + (isPaused ? ' sc-card-paused' : '');

    // Row 1: Title + Badge
    var row1 = el('div', { className: 'sc-card-header' },
      el('div', {},
        el('h3', { className: 'sc-card-title' }, cart.name || 'Shared Cart'),
        el('p', { className: 'sc-card-date' }, 'Created ' + formatDate(cart.createdAt))
      ),
      el('span', { className: badgeClass }, status)
    );

    // Row 2: Metrics strip
    var metricsStrip = el('div', { className: 'sc-metrics-strip' },
      el('div', { className: 'sc-metric' },
        el('p', { className: 'sc-metric-label' }, 'Items'),
        el('p', { className: 'sc-metric-value' }, String(itemCount))
      ),
      el('div', { className: 'sc-metric sc-metric-bordered' },
        el('p', { className: 'sc-metric-label' }, 'Impressions'),
        el('p', { className: 'sc-metric-value' }, String(cart.impressions || 0))
      ),
      el('div', { className: 'sc-metric' },
        el('p', { className: 'sc-metric-label' }, 'Conversions'),
        el('p', { className: 'sc-metric-value' }, String(cart.completedPurchases || 0))
      )
    );

    // Row 3: Actions
    var copyBtn = el('button', {
      className: 'sc-btn sc-btn-primary sc-btn-copy' + (isPaused ? ' sc-btn-disabled' : ''),
      disabled: isPaused,
      onclick: function () {
        if (cart.shareUrl) handleCopy(cart.shareUrl, cart.id);
      },
    }, icon('copy', 14), isCopied ? ' Copied!' : ' Copy Link');

    var toggleBtn;
    if (!isExpired) {
      if (isPaused) {
        toggleBtn = el('button', {
          className: 'sc-btn sc-btn-icon sc-btn-resume',
          title: 'Resume',
          onclick: function () { handleToggle(cart.id); },
        }, icon('play', 16));
      } else {
        toggleBtn = el('button', {
          className: 'sc-btn sc-btn-icon sc-btn-pause',
          title: 'Pause',
          onclick: function () { handleToggle(cart.id); },
        }, icon('pause', 16));
      }
    }

    var deleteBtn = el('button', {
      className: 'sc-btn sc-btn-icon sc-btn-delete',
      title: 'Delete',
      onclick: function () { handleDelete(cart.id); },
    }, icon('trash', 16));

    var detailsBtn = el('button', {
      className: 'sc-btn sc-btn-outline sc-btn-details',
      onclick: function () { navigateToDetail(cart.id); },
    }, 'Details');

    var actionsRow = el('div', { className: 'sc-card-actions' },
      copyBtn
    );
    if (toggleBtn) actionsRow.appendChild(toggleBtn);
    actionsRow.appendChild(deleteBtn);
    actionsRow.appendChild(detailsBtn);

    // Assemble card
    var card = el('div', { className: cardClass },
      row1, metricsStrip, actionsRow
    );

    // Loading overlay
    if (isLoading) {
      card.appendChild(el('div', { className: 'sc-card-loading' },
        el('span', {}, 'Loading...')
      ));
    }

    return card;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DETAIL VIEW
  // ══════════════════════════════════════════════════════════════════════════
  function buildDetail() {
    var cart = null;
    for (var i = 0; i < state.carts.length; i++) {
      if (state.carts[i].id === state.detailCartId) {
        cart = state.carts[i];
        break;
      }
    }
    if (!cart) {
      return el('div', { className: 'sc-dashboard' },
        el('button', { className: 'sc-back-btn', onclick: navigateToDashboard },
          icon('back', 16), ' Back to Shared Carts'
        ),
        el('div', { className: 'sc-empty' },
          el('p', {}, 'Cart not found.')
        )
      );
    }

    var status = getStatus(cart);
    var isCopied = state.copiedId === cart.id;
    var isLoading = state.actionLoading === cart.id;
    var itemCount = cart.items ? cart.items.length : 0;

    var container = el('div', { className: 'sc-detail' });

    // ── Back + Header ───────────────────────────────────────────────────────
    var backBtn = el('button', {
      className: 'sc-back-btn',
      onclick: navigateToDashboard,
    }, icon('back', 16), ' Back');

    var detailHeader = el('div', { className: 'sc-detail-header' },
      backBtn,
      el('div', { className: 'sc-detail-title-row' },
        el('div', {},
          el('h2', { className: 'sc-title' }, cart.name || 'Shared Cart'),
          el('p', { className: 'sc-subtitle' }, 'Created ' + formatDate(cart.createdAt))
        )
      )
    );
    container.appendChild(detailHeader);

    // ── Status Toggle ───────────────────────────────────────────────────────
    var statusClass = 'sc-status-card' + (status === 'Active' ? ' sc-status-active' : status === 'Expired' ? ' sc-status-expired' : '');

    var badgeClass = 'sc-badge ' + (
      status === 'Active' ? 'sc-badge-active' :
      status === 'Paused' ? 'sc-badge-paused' :
      'sc-badge-expired'
    );

    var statusCard = el('div', { className: statusClass },
      el('div', {},
        el('p', { className: 'sc-status-title' }, 'Status'),
        el('p', { className: 'sc-status-desc' },
          status === 'Active' ? 'Visible to customers and tracking metrics' :
          status === 'Paused' ? 'Link is paused and not accessible' :
          'This cart has expired'
        )
      ),
      el('span', { className: badgeClass }, status)
    );

    if (status !== 'Expired') {
      var toggleDetailBtn = el('button', {
        className: 'sc-btn ' + (status === 'Active' ? 'sc-btn-outline' : 'sc-btn-primary'),
        onclick: function () { handleToggle(cart.id); },
        disabled: isLoading,
      }, status === 'Active' ? 'Pause Cart' : 'Activate Cart');
      statusCard.appendChild(toggleDetailBtn);
    }

    container.appendChild(statusCard);

    // ── Metrics Grid ────────────────────────────────────────────────────────
    var totalRevenue = 0;
    if (cart.orders && cart.orders.length > 0) {
      cart.orders.forEach(function (o) {
        if (o.orderValue != null) totalRevenue += o.orderValue;
      });
    }

    var metricsGrid = el('div', { className: 'sc-detail-metrics' },
      el('div', { className: 'sc-detail-metric-card' },
        el('p', { className: 'sc-metric-label' }, 'Views'),
        el('p', { className: 'sc-detail-metric-value' }, String(cart.impressions || 0))
      ),
      el('div', { className: 'sc-detail-metric-card' },
        el('p', { className: 'sc-metric-label' }, 'Orders'),
        el('p', { className: 'sc-detail-metric-value' }, String(cart.completedPurchases || 0))
      ),
      el('div', { className: 'sc-detail-metric-card' },
        el('p', { className: 'sc-metric-label' }, 'Revenue'),
        el('p', { className: 'sc-detail-metric-value' }, '$' + totalRevenue.toFixed(2))
      )
    );
    container.appendChild(metricsGrid);

    // ── Share Link Section ──────────────────────────────────────────────────
    if (cart.shareUrl) {
      var copyUrlBtn = el('button', {
        className: 'sc-btn sc-btn-primary',
        onclick: function () { handleCopy(cart.shareUrl, cart.id); },
      }, icon('copy', 14), isCopied ? ' Copied!' : ' Copy');

      var shareSection = el('div', { className: 'sc-share-section' },
        el('h3', { className: 'sc-section-title' },
          icon('link', 16), ' Share Link'
        ),
        el('div', { className: 'sc-share-row' },
          el('div', { className: 'sc-share-url' }, cart.shareUrl),
          copyUrlBtn
        )
      );
      container.appendChild(shareSection);

      // ── QR Code ───────────────────────────────────────────────────────────
      var qrSection = el('div', { className: 'sc-qr-section' },
        el('div', { className: 'sc-qr-box' },
          el('s-qr-code', { content: cart.shareUrl })
        ),
        el('div', { className: 'sc-qr-text' },
          el('h4', {}, 'Scan QR Code'),
          el('p', { className: 'sc-text-subdued' }, 'Customers can scan this code to instantly load this cart.')
        )
      );
      container.appendChild(qrSection);
    }

    // ── Cart Contents ───────────────────────────────────────────────────────
    if (cart.items && cart.items.length > 0) {
      var itemsSection = el('div', { className: 'sc-items-section' },
        el('h3', { className: 'sc-section-title' }, 'Cart Contents')
      );

      var itemsList = el('div', { className: 'sc-items-list' });

      var subtotal = 0;

      cart.items.forEach(function (item) {
        var name = item.title || item.handle || ('Product #' + item.variantId);
        var varLabel = (item.variantTitle && item.variantTitle !== 'Default Title')
          ? item.variantTitle : '';
        var priceNum = item.price ? item.price / 100 : 0;
        var lineTotal = priceNum * (item.quantity || 1);
        subtotal += lineTotal;

        var itemImageEl = null;
        if (item.image) {
          var imgUrl = item.image;
          if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
          var img = document.createElement('img');
          img.src = imgUrl;
          img.alt = name;
          img.className = 'sc-item-image';
          itemImageEl = img;
        } else {
          itemImageEl = el('div', { className: 'sc-item-image sc-item-placeholder' });
        }

        var itemRow = el('div', { className: 'sc-item-row' },
          itemImageEl,
          el('div', { className: 'sc-item-info' },
            el('p', { className: 'sc-item-name' }, name),
            varLabel ? el('p', { className: 'sc-text-subdued' }, varLabel) : null
          ),
          el('div', { className: 'sc-item-pricing' },
            el('p', { className: 'sc-item-price' }, '$' + priceNum.toFixed(2)),
            el('p', { className: 'sc-text-subdued' }, 'Qty: ' + (item.quantity || 1))
          )
        );
        itemsList.appendChild(itemRow);
      });

      itemsSection.appendChild(itemsList);

      // Subtotal
      itemsSection.appendChild(
        el('div', { className: 'sc-subtotal' },
          el('span', {}, 'Subtotal'),
          el('span', { className: 'sc-subtotal-value' }, '$' + subtotal.toFixed(2))
        )
      );

      container.appendChild(itemsSection);
    }

    // ── Promo Codes ─────────────────────────────────────────────────────────
    if (cart.promoCodes && cart.promoCodes.length > 0) {
      var promoParts = [el('h3', { className: 'sc-section-title' }, 'Promo Codes')];
      var promoCodes = el('div', { className: 'sc-promo-list' });
      cart.promoCodes.forEach(function (p) {
        promoCodes.appendChild(el('span', { className: 'sc-badge sc-badge-promo' }, p.code));
      });
      promoParts.push(promoCodes);

      container.appendChild(el('div', { className: 'sc-promo-section' }, promoParts));
    }

    // ── Expiry Info ─────────────────────────────────────────────────────────
    if (cart.expiresAt) {
      container.appendChild(
        el('div', { className: 'sc-expiry-info' },
          el('p', { className: 'sc-text-subdued' },
            (status === 'Expired' ? 'Expired ' : 'Expires ') + formatDate(cart.expiresAt)
          )
        )
      );
    } else if (cart.neverExpires) {
      container.appendChild(
        el('div', { className: 'sc-expiry-info' },
          el('p', { className: 'sc-text-subdued' }, 'Never expires')
        )
      );
    }

    // ── Orders Table ────────────────────────────────────────────────────────
    if (cart.orders && cart.orders.length > 0) {
      var ordersSection = el('div', { className: 'sc-orders-section' },
        el('h3', { className: 'sc-section-title' }, 'Orders from this cart')
      );

      var table = el('table', { className: 'sc-orders-table' });
      var thead = el('thead', {},
        el('tr', {},
          el('th', {}, 'Order'),
          el('th', { className: 'sc-text-right' }, 'Amount'),
          el('th', { className: 'sc-text-right' }, 'Date')
        )
      );
      table.appendChild(thead);

      var tbody = el('tbody', {});
      cart.orders.forEach(function (order) {
        var orderName = order.shopifyOrderName || order.shopifyOrderId || '—';
        var orderAmt = order.orderValue != null ? '$' + order.orderValue.toFixed(2) : '—';
        var orderDate = formatDate(order.createdAt);

        tbody.appendChild(
          el('tr', {},
            el('td', { className: 'sc-order-name' }, orderName),
            el('td', { className: 'sc-text-right' }, orderAmt),
            el('td', { className: 'sc-text-right sc-text-subdued' }, orderDate)
          )
        );
      });
      table.appendChild(tbody);

      ordersSection.appendChild(table);
      container.appendChild(ordersSection);
    }

    // ── Delete Button ───────────────────────────────────────────────────────
    container.appendChild(
      el('div', { className: 'sc-detail-footer' },
        el('button', {
          className: 'sc-btn sc-btn-danger',
          onclick: function () { handleDelete(cart.id); },
          disabled: isLoading,
        }, icon('trash', 14), ' Delete this cart')
      )
    );

    return container;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  UI ROUTER
  // ══════════════════════════════════════════════════════════════════════════
  function buildUI() {
    if (state.loading) {
      return el('div', { className: 'sc-dashboard sc-loading' },
        el('div', { className: 'sc-spinner' }),
        el('p', { className: 'sc-text-subdued' }, 'Loading your shared carts\u2026')
      );
    }

    if (state.errorMsg) {
      return el('div', { className: 'sc-dashboard' },
        el('div', { className: 'sc-error' },
          el('h3', {}, 'Error loading carts'),
          el('p', {}, state.errorMsg)
        )
      );
    }

    if (state.currentView === 'detail') {
      return buildDetail();
    }

    return buildDashboard();
  }

  // ── bootstrap ─────────────────────────────────────────────────────────────
  rerender();
  fetchCarts();
}

// ══════════════════════════════════════════════════════════════════════════════
//  CSS
// ══════════════════════════════════════════════════════════════════════════════
function getCSS() {
  return [
    // ── Reset & Base ──────────────────────────────────────────────────────
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    ':host { --sc-primary: #008060; --sc-primary-light: rgba(0,128,96,.1); --sc-primary-hover: rgba(0,128,96,.85); --sc-bg: #f5f8f8; --sc-surface: #fff; --sc-border: #e2e8f0; --sc-text: #0f172a; --sc-text-subdued: #64748b; --sc-danger: #dc2626; --sc-danger-light: rgba(220,38,38,.08); --sc-amber: #d97706; --sc-amber-light: rgba(217,119,6,.1); --sc-green: #15803d; --sc-green-light: rgba(22,128,61,.1); --sc-radius: 0.75rem; --sc-radius-sm: 0.5rem; --sc-shadow: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04); --sc-shadow-hover: 0 4px 12px rgba(0,0,0,.08); --sc-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }',

    // ── Layout ────────────────────────────────────────────────────────────
    '.sc-dashboard, .sc-detail { font-family: var(--sc-font); color: var(--sc-text); padding: 4px 0; }',
    '.sc-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; gap: 12px; }',

    // Spinner
    '@keyframes sc-spin { to { transform: rotate(360deg); } }',
    '.sc-spinner { width: 28px; height: 28px; border: 3px solid var(--sc-border); border-top-color: var(--sc-primary); border-radius: 50%; animation: sc-spin .7s linear infinite; }',

    // ── Header ────────────────────────────────────────────────────────────
    '.sc-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }',
    '.sc-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.025em; color: var(--sc-text); }',
    '.sc-subtitle { font-size: 0.875rem; color: var(--sc-text-subdued); margin-top: 2px; }',

    // ── Search ────────────────────────────────────────────────────────────
    '.sc-search-bar { position: relative; max-width: 400px; margin-bottom: 20px; }',
    '.sc-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--sc-text-subdued); display: flex; }',
    '.sc-search-input { width: 100%; padding: 8px 12px 8px 36px; border: 1px solid var(--sc-border); border-radius: var(--sc-radius-sm); font-size: 0.875rem; outline: none; background: var(--sc-surface); color: var(--sc-text); transition: border-color .15s; }',
    '.sc-search-input:focus { border-color: var(--sc-primary); box-shadow: 0 0 0 2px var(--sc-primary-light); }',

    // ── Grid ──────────────────────────────────────────────────────────────
    '.sc-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }',
    '@media (min-width: 640px) { .sc-grid { grid-template-columns: repeat(2, 1fr); } }',

    // ── Card ──────────────────────────────────────────────────────────────
    '.sc-card { background: var(--sc-surface); border: 1px solid var(--sc-border); border-radius: var(--sc-radius); padding: 20px; display: flex; flex-direction: column; gap: 16px; box-shadow: var(--sc-shadow); transition: box-shadow .2s, opacity .2s; position: relative; overflow: hidden; }',
    '.sc-card:hover { box-shadow: var(--sc-shadow-hover); }',
    '.sc-card-paused { opacity: 0.72; }',
    '.sc-card-loading { position: absolute; inset: 0; background: rgba(255,255,255,.7); display: flex; align-items: center; justify-content: center; font-size: 0.875rem; color: var(--sc-text-subdued); border-radius: var(--sc-radius); }',

    // Card header
    '.sc-card-header { display: flex; justify-content: space-between; align-items: flex-start; }',
    '.sc-card-title { font-size: 1.05rem; font-weight: 700; color: var(--sc-text); }',
    '.sc-card-date { font-size: 0.75rem; color: var(--sc-text-subdued); margin-top: 2px; }',

    // ── Badge ─────────────────────────────────────────────────────────────
    '.sc-badge { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 8px; border-radius: 4px; white-space: nowrap; }',
    '.sc-badge-active { background: var(--sc-green-light); color: var(--sc-green); }',
    '.sc-badge-paused { background: var(--sc-amber-light); color: var(--sc-amber); }',
    '.sc-badge-expired { background: var(--sc-danger-light); color: var(--sc-danger); }',
    '.sc-badge-promo { background: var(--sc-primary-light); color: var(--sc-primary); font-size: 12px; }',

    // ── Metrics Strip ────────────────────────────────────────────────────
    '.sc-metrics-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 12px 0; border-top: 1px solid var(--sc-border); border-bottom: 1px solid var(--sc-border); }',
    '.sc-metric { text-align: center; }',
    '.sc-metric-bordered { border-left: 1px solid var(--sc-border); border-right: 1px solid var(--sc-border); }',
    '.sc-metric-label { font-size: 0.7rem; color: var(--sc-text-subdued); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }',
    '.sc-metric-value { font-size: 1.1rem; font-weight: 800; color: var(--sc-text); margin-top: 2px; }',

    // ── Card Actions ──────────────────────────────────────────────────────
    '.sc-card-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
    '.sc-btn-copy { flex: 1; }',

    // ── Buttons ───────────────────────────────────────────────────────────
    '.sc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px; border-radius: var(--sc-radius-sm); font-size: 0.8125rem; font-weight: 600; border: none; cursor: pointer; transition: all .15s; font-family: var(--sc-font); line-height: 1.3; }',
    '.sc-btn:disabled { opacity: 0.5; cursor: not-allowed; }',
    '.sc-btn svg { flex-shrink: 0; }',

    '.sc-btn-primary { background: var(--sc-primary); color: #fff; }',
    '.sc-btn-primary:hover:not(:disabled) { background: var(--sc-primary-hover); }',

    '.sc-btn-outline { background: transparent; border: 1px solid var(--sc-border); color: var(--sc-text); }',
    '.sc-btn-outline:hover:not(:disabled) { background: #f8fafc; }',

    '.sc-btn-icon { padding: 8px; background: #f1f5f9; color: var(--sc-text-subdued); border-radius: var(--sc-radius-sm); }',
    '.sc-btn-icon:hover:not(:disabled) { background: #e2e8f0; }',

    '.sc-btn-resume { background: var(--sc-primary-light); color: var(--sc-primary); }',
    '.sc-btn-resume:hover:not(:disabled) { background: var(--sc-primary); color: #fff; }',

    '.sc-btn-delete { border: 1px solid rgba(220,38,38,.2); color: var(--sc-danger); background: transparent; }',
    '.sc-btn-delete:hover:not(:disabled) { background: var(--sc-danger-light); }',

    '.sc-btn-danger { background: transparent; border: 1px solid rgba(220,38,38,.25); color: var(--sc-danger); padding: 10px 20px; }',
    '.sc-btn-danger:hover:not(:disabled) { background: var(--sc-danger-light); }',

    '.sc-btn-disabled { opacity: 0.5; cursor: not-allowed; }',

    // ── Pagination ────────────────────────────────────────────────────────
    '.sc-pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 32px; }',
    '.sc-page-info { font-size: 0.875rem; color: var(--sc-text-subdued); }',

    // ── Empty / Error ─────────────────────────────────────────────────────
    '.sc-empty, .sc-error { text-align: center; padding: 48px 16px; }',
    '.sc-empty h3, .sc-error h3 { font-size: 1.125rem; font-weight: 700; margin-bottom: 8px; }',
    '.sc-empty p, .sc-error p { color: var(--sc-text-subdued); font-size: 0.875rem; }',
    '.sc-error { background: var(--sc-danger-light); border-radius: var(--sc-radius); }',

    // ══════════════════════════════════════════════════════════════════════
    //  DETAIL VIEW
    // ══════════════════════════════════════════════════════════════════════
    '.sc-detail { display: flex; flex-direction: column; gap: 20px; }',
    '.sc-detail-header { display: flex; flex-direction: column; gap: 12px; }',

    '.sc-back-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--sc-primary); font-weight: 600; font-size: 0.875rem; cursor: pointer; padding: 4px 0; font-family: var(--sc-font); }',
    '.sc-back-btn:hover { text-decoration: underline; }',
    '.sc-back-btn svg { flex-shrink: 0; }',

    '.sc-detail-title-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }',

    // Status card
    '.sc-status-card { display: flex; align-items: center; gap: 16px; padding: 16px; border-radius: var(--sc-radius); border: 1px solid var(--sc-border); background: var(--sc-surface); flex-wrap: wrap; }',
    '.sc-status-active { border-color: rgba(0,128,96,.2); background: var(--sc-primary-light); }',
    '.sc-status-expired { border-color: rgba(220,38,38,.2); background: var(--sc-danger-light); }',
    '.sc-status-title { font-weight: 700; font-size: 0.9375rem; }',
    '.sc-status-desc { font-size: 0.8125rem; color: var(--sc-text-subdued); margin-top: 2px; }',

    // Detail metrics
    '.sc-detail-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }',
    '.sc-detail-metric-card { background: var(--sc-surface); border: 1px solid var(--sc-border); border-radius: var(--sc-radius); padding: 16px; display: flex; flex-direction: column; gap: 4px; }',
    '.sc-detail-metric-value { font-size: 1.5rem; font-weight: 800; color: var(--sc-text); }',

    // Share section
    '.sc-share-section { background: var(--sc-surface); border: 1px solid var(--sc-border); border-radius: var(--sc-radius); padding: 16px; }',
    '.sc-section-title { font-size: 0.9375rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }',
    '.sc-section-title svg { color: var(--sc-primary); }',
    '.sc-share-row { display: flex; gap: 8px; }',
    '.sc-share-url { flex: 1; background: #f8fafc; border: 1px solid var(--sc-border); border-radius: var(--sc-radius-sm); padding: 8px 12px; font-size: 0.8125rem; color: var(--sc-text-subdued); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; word-break: break-all; }',

    // QR section
    '.sc-qr-section { display: flex; align-items: center; gap: 16px; padding: 16px; border: 1px solid var(--sc-border); border-radius: var(--sc-radius); background: var(--sc-surface); }',
    '.sc-qr-box { width: 96px; height: 96px; border: 1px solid var(--sc-border); border-radius: var(--sc-radius-sm); padding: 4px; background: #fff; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }',
    '.sc-qr-box s-qr-code { width: 100%; height: 100%; }',
    '.sc-qr-text h4 { font-size: 0.875rem; font-weight: 700; }',
    '.sc-qr-text p { font-size: 0.75rem; margin-top: 4px; }',

    // Items section
    '.sc-items-section { background: var(--sc-surface); border: 1px solid var(--sc-border); border-radius: var(--sc-radius); overflow: hidden; }',
    '.sc-items-section .sc-section-title { padding: 16px 16px 0; }',
    '.sc-items-list { padding: 0; }',
    '.sc-item-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--sc-border); }',
    '.sc-item-row:last-child { border-bottom: none; }',
    '.sc-item-image { width: 56px; height: 56px; border-radius: var(--sc-radius-sm); object-fit: cover; border: 1px solid var(--sc-border); flex-shrink: 0; background: #f1f5f9; }',
    '.sc-item-placeholder { background: #e2e8f0; }',
    '.sc-item-info { flex: 1; min-width: 0; }',
    '.sc-item-name { font-weight: 600; font-size: 0.875rem; color: var(--sc-text); }',
    '.sc-item-pricing { text-align: right; flex-shrink: 0; }',
    '.sc-item-price { font-weight: 700; color: var(--sc-primary); font-size: 0.875rem; }',
    '.sc-subtotal { display: flex; justify-content: space-between; padding: 14px 16px; border-top: 2px dashed var(--sc-border); }',
    '.sc-subtotal-value { font-size: 1.1rem; font-weight: 800; }',

    // Promo section
    '.sc-promo-section { padding: 16px; background: var(--sc-surface); border: 1px solid var(--sc-border); border-radius: var(--sc-radius); }',
    '.sc-promo-list { display: flex; gap: 8px; flex-wrap: wrap; }',

    // Expiry info
    '.sc-expiry-info { padding: 12px 16px; background: var(--sc-surface); border: 1px solid var(--sc-border); border-radius: var(--sc-radius); }',

    // Orders table
    '.sc-orders-section { background: var(--sc-surface); border: 1px solid var(--sc-border); border-radius: var(--sc-radius); overflow: hidden; }',
    '.sc-orders-section .sc-section-title { padding: 16px 16px 0; }',
    '.sc-orders-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }',
    '.sc-orders-table thead { background: #f8fafc; }',
    '.sc-orders-table th { padding: 10px 16px; font-weight: 600; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; color: var(--sc-text-subdued); }',
    '.sc-orders-table td { padding: 12px 16px; border-top: 1px solid var(--sc-border); }',
    '.sc-orders-table tr:hover td { background: rgba(0,128,96,.03); }',
    '.sc-order-name { font-weight: 600; color: var(--sc-primary); }',

    // Detail footer
    '.sc-detail-footer { padding-top: 12px; display: flex; justify-content: flex-end; }',

    // ── Shared utility ────────────────────────────────────────────────────
    '.sc-text-subdued { color: var(--sc-text-subdued); font-size: 0.8125rem; }',
    '.sc-text-right { text-align: right; }',
  ].join('\n');
}
