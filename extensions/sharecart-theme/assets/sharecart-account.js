(function () {
  'use strict';

  var API_BASE = '/apps/sharecart/api/storefront/my-carts';
  var container = document.getElementById('sharecart-account-widget');
  if (!container) return;

  var customerId = container.dataset.customerId || '';
  if (!customerId) { container.innerHTML = ''; return; }

  // ── State ──
  var page = 1;
  var totalPages = 1;
  var allCarts = [];
  var searchQuery = '';
  var currentView = 'dashboard';   // 'dashboard' | 'detail'
  var detailCartId = null;
  var copiedId = null;
  var actionLoading = null;
  var allowDeactivate = true;
  var allowDelete = true;

  // ── Utility ──

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatPrice(cents) {
    if (cents == null) return '';
    return '$' + (cents / 100).toFixed(2);
  }

  function getStatus(cart) {
    if (!cart.isActive) return 'Paused';
    if (cart.expiresAt && new Date(cart.expiresAt) < new Date()) return 'Expired';
    return 'Active';
  }

  // ── API ──

  function apiFetch(url, method) {
    return fetch(url, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function copyToClipboard(text, cartId) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        copiedId = cartId;
        render();
        setTimeout(function () { copiedId = null; render(); }, 2000);
      });
    }
  }

  // ── CSS ──

  function injectStyles() {
    if (document.getElementById('sc-account-styles')) return;
    var style = document.createElement('style');
    style.id = 'sc-account-styles';
    style.textContent = getCSS();
    document.head.appendChild(style);
  }

  // ── Load ──

  function load() {
    container.innerHTML = '<div class="sc-loading"><div class="sc-spinner"></div><p class="sc-text-muted">Loading your shared carts…</p></div>';
    var url = API_BASE + '?logged_in_customer_id=' + encodeURIComponent(customerId) + '&page=' + page + '&perPage=20';
    apiFetch(url)
      .then(function (data) {
        injectStyles();
        allCarts = data.shareCarts || [];
        totalPages = data.totalPages || 1;
        if (data.allowCustomerDeactivate !== undefined) allowDeactivate = data.allowCustomerDeactivate;
        if (data.allowCustomerDelete !== undefined) allowDelete = data.allowCustomerDelete;
        render();
      })
      .catch(function (err) {
        console.error('[ShareCart Account]', err);
        container.innerHTML = '<div class="sc-error"><h3>Error loading carts</h3><p>Could not load shared carts. Please try refreshing the page.</p></div>';
      });
  }

  function render() {
    if (currentView === 'detail') {
      renderDetailView();
    } else {
      renderDashboard();
    }
    bindEvents();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DASHBOARD VIEW
  // ══════════════════════════════════════════════════════════════════════════

  function renderDashboard() {
    var filteredCarts = allCarts;
    if (searchQuery.trim()) {
      var q = searchQuery.trim().toLowerCase();
      filteredCarts = allCarts.filter(function (c) {
        return (c.name || '').toLowerCase().indexOf(q) !== -1;
      });
    }

    var html = '';

    // Header
    html += '<div class="sc-header">';
    html += '<div>';
    html += '<h2 class="sc-title">Shared Carts</h2>';
    html += '<p class="sc-subtitle">Manage and track your shared shopping links.</p>';
    html += '</div>';
    html += '</div>';

    // Search
    html += '<div class="sc-search-bar">';
    html += '<svg class="sc-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
    html += '<input type="text" class="sc-search-input" id="sc-search" placeholder="Search carts..." value="' + esc(searchQuery) + '">';
    html += '</div>';

    // Grid
    if (filteredCarts.length === 0 && !searchQuery.trim()) {
      html += '<div class="sc-empty">';
      html += '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" style="margin:0 auto 16px;display:block;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>';
      html += '<h3>No shared carts yet</h3>';
      html += '<p>Build a cart while browsing the store and click the share button to get started.</p>';
      html += '</div>';
    } else if (filteredCarts.length === 0) {
      html += '<div class="sc-empty"><p>No carts matching "' + esc(searchQuery) + '"</p></div>';
    } else {
      html += '<div class="sc-grid">';
      for (var i = 0; i < filteredCarts.length; i++) {
        html += renderCartCard(filteredCarts[i]);
      }
      html += '</div>';
    }

    // Pagination
    if (totalPages > 1) {
      html += '<div class="sc-pagination">';
      html += '<button class="sc-btn sc-btn-outline" id="sc-prev"' + (page <= 1 ? ' disabled' : '') + '>Previous</button>';
      html += '<span class="sc-page-info">Page ' + page + ' of ' + totalPages + '</span>';
      html += '<button class="sc-btn sc-btn-outline" id="sc-next"' + (page >= totalPages ? ' disabled' : '') + '>Next</button>';
      html += '</div>';
    }

    container.innerHTML = html;
  }

  function renderCartCard(cart) {
    var status = getStatus(cart);
    var isPaused = status === 'Paused';
    var isExpired = status === 'Expired';
    var isCopied = copiedId === cart.id;
    var itemCount = cart.items ? cart.items.length : 0;

    var badgeClass = status === 'Active' ? 'sc-badge-active' :
                     status === 'Paused' ? 'sc-badge-paused' : 'sc-badge-expired';
    var cardClass = 'sc-card' + (isPaused ? ' sc-card-paused' : '');

    var html = '<div class="' + cardClass + '" data-id="' + esc(cart.id) + '">';

    // Header: title + badge
    html += '<div class="sc-card-header">';
    html += '<div>';
    html += '<h3 class="sc-card-title">' + esc(cart.name || 'Shared Cart') + '</h3>';
    html += '<p class="sc-card-date">Created ' + formatDate(cart.createdAt) + '</p>';
    html += '</div>';
    html += '<span class="sc-badge ' + badgeClass + '">' + status + '</span>';
    html += '</div>';

    // Metrics strip
    html += '<div class="sc-metrics-strip">';
    html += '<div class="sc-metric"><p class="sc-metric-label">Items</p><p class="sc-metric-value">' + itemCount + '</p></div>';
    html += '<div class="sc-metric sc-metric-bordered"><p class="sc-metric-label">Impressions</p><p class="sc-metric-value">' + (cart.impressions || 0) + '</p></div>';
    html += '<div class="sc-metric"><p class="sc-metric-label">Conversions</p><p class="sc-metric-value">' + (cart.completedPurchases || 0) + '</p></div>';
    html += '</div>';

    // Actions
    html += '<div class="sc-card-actions">';

    // Copy button
    html += '<button class="sc-btn sc-btn-primary sc-btn-copy sc-act-copy"' +
            (isPaused ? ' disabled' : '') +
            ' data-url="' + esc(cart.shareUrl) + '" data-cart-id="' + esc(cart.id) + '">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    html += isCopied ? ' Copied!' : ' Copy Link';
    html += '</button>';

    // Toggle button
    if (!isExpired && allowDeactivate) {
      if (isPaused) {
        html += '<button class="sc-btn sc-btn-icon sc-btn-resume sc-act-toggle" data-id="' + esc(cart.id) + '" title="Resume">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        html += '</button>';
      } else {
        html += '<button class="sc-btn sc-btn-icon sc-btn-pause sc-act-toggle" data-id="' + esc(cart.id) + '" title="Pause">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
        html += '</button>';
      }
    }

    // Delete button
    if (allowDelete) {
      html += '<button class="sc-btn sc-btn-icon sc-btn-delete sc-act-delete" data-id="' + esc(cart.id) + '" title="Delete">';
      html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
      html += '</button>';
    }

    // Details button
    html += '<button class="sc-btn sc-btn-outline sc-btn-details sc-act-details" data-id="' + esc(cart.id) + '">Details</button>';

    html += '</div>'; // actions
    html += '</div>'; // card

    return html;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DETAIL VIEW
  // ══════════════════════════════════════════════════════════════════════════

  function renderDetailView() {
    var cart = null;
    for (var i = 0; i < allCarts.length; i++) {
      if (allCarts[i].id === detailCartId) { cart = allCarts[i]; break; }
    }
    if (!cart) {
      container.innerHTML = '<div class="sc-detail"><button class="sc-back-btn" id="sc-back">&larr; Back to Shared Carts</button><div class="sc-empty"><p>Cart not found.</p></div></div>';
      return;
    }

    var status = getStatus(cart);
    var isCopied = copiedId === cart.id;
    var isPaused = status === 'Paused';
    var isExpired = status === 'Expired';
    var itemCount = cart.items ? cart.items.length : 0;

    var html = '<div class="sc-detail">';

    // Back + header
    html += '<button class="sc-back-btn" id="sc-back">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>';
    html += ' Back';
    html += '</button>';

    html += '<div class="sc-detail-title-row">';
    html += '<div>';
    html += '<h2 class="sc-title">' + esc(cart.name || 'Shared Cart') + '</h2>';
    html += '<p class="sc-subtitle">Created ' + formatDate(cart.createdAt) + '</p>';
    html += '</div>';
    html += '</div>';

    // Status card
    var statusBg = status === 'Active' ? 'sc-status-active' : status === 'Expired' ? 'sc-status-expired' : '';
    var badgeClass = status === 'Active' ? 'sc-badge-active' : status === 'Paused' ? 'sc-badge-paused' : 'sc-badge-expired';

    html += '<div class="sc-status-card ' + statusBg + '">';
    html += '<div class="sc-status-card-info">';
    html += '<p class="sc-status-title">Status</p>';
    html += '<p class="sc-status-desc">' + (status === 'Active' ? 'Visible to customers and tracking metrics' : status === 'Paused' ? 'Link is paused and not accessible' : 'This cart has expired') + '</p>';
    html += '</div>';
    html += '<span class="sc-badge ' + badgeClass + '">' + status + '</span>';
    if (status !== 'Expired' && allowDeactivate) {
      html += '<button class="sc-btn ' + (status === 'Active' ? 'sc-btn-outline' : 'sc-btn-primary') + ' sc-act-toggle" data-id="' + esc(cart.id) + '">';
      html += status === 'Active' ? 'Pause Cart' : 'Activate Cart';
      html += '</button>';
    }
    html += '</div>';

    // Metrics
    var totalRevenue = 0;
    if (cart.orders && cart.orders.length > 0) {
      cart.orders.forEach(function (o) { if (o.orderValue != null) totalRevenue += o.orderValue; });
    }

    html += '<div class="sc-detail-metrics">';
    html += '<div class="sc-detail-metric-card"><p class="sc-metric-label">Views</p><p class="sc-detail-metric-value">' + (cart.impressions || 0) + '</p></div>';
    html += '<div class="sc-detail-metric-card"><p class="sc-metric-label">Orders</p><p class="sc-detail-metric-value">' + (cart.completedPurchases || 0) + '</p></div>';
    html += '<div class="sc-detail-metric-card"><p class="sc-metric-label">Revenue</p><p class="sc-detail-metric-value">$' + totalRevenue.toFixed(2) + '</p></div>';
    html += '</div>';

    // Share link
    if (cart.shareUrl) {
      html += '<div class="sc-share-section">';
      html += '<h3 class="sc-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Share Link</h3>';
      html += '<div class="sc-share-row">';
      html += '<div class="sc-share-url">' + esc(cart.shareUrl) + '</div>';
      html += '<button class="sc-btn sc-btn-primary sc-act-copy" data-url="' + esc(cart.shareUrl) + '" data-cart-id="' + esc(cart.id) + '">';
      html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      html += isCopied ? ' Copied!' : ' Copy';
      html += '</button>';
      html += '</div></div>';

      // QR Code
      var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(cart.shareUrl);
      html += '<div class="sc-qr-section">';
      html += '<div class="sc-qr-box"><img src="' + esc(qrUrl) + '" alt="QR Code" width="120" height="120" style="display:block;"></div>';
      html += '<div class="sc-qr-text">';
      html += '<h4>Scan QR Code</h4>';
      html += '<p class="sc-text-muted">Customers can scan this code to instantly load this cart.</p>';
      html += '<a class="sc-btn sc-btn-outline" href="' + esc(qrUrl) + '&format=png' + '" download="sharecart-qr.png" style="margin-top:8px;">';
      html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';
      html += ' Download QR';
      html += '</a>';
      html += '</div>';
      html += '</div>';
    }

    // Cart contents
    if (cart.items && cart.items.length > 0) {
      html += '<div class="sc-items-section">';
      html += '<h3 class="sc-section-title">Cart Contents</h3>';
      html += '<div class="sc-items-list">';

      var subtotal = 0;
      cart.items.forEach(function (item) {
        var name = item.title || item.handle || ('Product #' + item.variantId);
        var varLabel = (item.variantTitle && item.variantTitle !== 'Default Title') ? item.variantTitle : '';
        var priceNum = item.price ? item.price / 100 : 0;
        var lineTotal = priceNum * (item.quantity || 1);
        subtotal += lineTotal;

        html += '<div class="sc-item-row">';

        if (item.image) {
          var imgUrl = item.image;
          if (imgUrl.indexOf('//') === 0) imgUrl = 'https:' + imgUrl;
          html += '<img class="sc-item-image" src="' + esc(imgUrl) + '" alt="' + esc(name) + '">';
        } else {
          html += '<div class="sc-item-image sc-item-placeholder"></div>';
        }

        html += '<div class="sc-item-info">';
        html += '<p class="sc-item-name">' + esc(name) + '</p>';
        if (varLabel) html += '<p class="sc-text-muted">' + esc(varLabel) + '</p>';
        html += '</div>';
        html += '<div class="sc-item-pricing">';
        html += '<p class="sc-item-price">$' + priceNum.toFixed(2) + '</p>';
        html += '<p class="sc-text-muted">Qty: ' + (item.quantity || 1) + '</p>';
        html += '</div>';
        html += '</div>';
      });

      html += '</div>'; // items-list
      html += '<div class="sc-subtotal"><span>Subtotal</span><span class="sc-subtotal-value">$' + subtotal.toFixed(2) + '</span></div>';
      html += '</div>'; // items-section
    }

    // Promo codes
    if (cart.promoCodes && cart.promoCodes.length > 0) {
      html += '<div class="sc-promo-section">';
      html += '<h3 class="sc-section-title">Promo Codes</h3>';
      html += '<div class="sc-promo-list">';
      cart.promoCodes.forEach(function (p) {
        html += '<span class="sc-badge sc-badge-promo">' + esc(p.code) + '</span>';
      });
      html += '</div></div>';
    }

    // Expiry
    if (cart.expiresAt) {
      html += '<div class="sc-expiry-info"><p class="sc-text-muted">' + (status === 'Expired' ? 'Expired ' : 'Expires ') + formatDate(cart.expiresAt) + '</p></div>';
    } else if (cart.neverExpires) {
      html += '<div class="sc-expiry-info"><p class="sc-text-muted">Never expires</p></div>';
    }

    // Orders table
    if (cart.orders && cart.orders.length > 0) {
      html += '<div class="sc-orders-section">';
      html += '<h3 class="sc-section-title">Orders from this cart</h3>';
      html += '<table class="sc-orders-table">';
      html += '<thead><tr><th>Order</th><th>Amount</th><th>Date</th></tr></thead>';
      html += '<tbody>';
      cart.orders.forEach(function (order) {
        html += '<tr>';
        html += '<td class="sc-order-name">' + esc(order.shopifyOrderName || order.shopifyOrderId || '—') + '</td>';
        html += '<td>' + (order.orderValue != null ? '$' + order.orderValue.toFixed(2) : '—') + '</td>';
        html += '<td class="sc-text-muted">' + formatDate(order.createdAt) + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }

    // Delete button
    if (allowDelete) {
      html += '<div class="sc-detail-footer">';
      html += '<button class="sc-btn sc-btn-danger sc-act-delete" data-id="' + esc(cart.id) + '">';
      html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
      html += ' Delete this cart';
      html += '</button>';
      html += '</div>';
    }

    html += '</div>'; // sc-detail

    container.innerHTML = html;
  }

  // ── Event binding ──

  function bindEvents() {
    // Search
    var searchInput = document.getElementById('sc-search');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        searchQuery = e.target.value;
        render();
        // Re-focus and restore cursor position
        var el = document.getElementById('sc-search');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      });
    }

    // Copy buttons
    container.querySelectorAll('.sc-act-copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        copyToClipboard(btn.dataset.url, btn.dataset.cartId);
      });
    });

    // Toggle buttons
    container.querySelectorAll('.sc-act-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = '...';
        apiFetch(API_BASE + '/' + id + '/toggle?logged_in_customer_id=' + encodeURIComponent(customerId), 'PATCH')
          .then(function () { load(); })
          .catch(function () { btn.disabled = false; });
      });
    });

    // Delete buttons
    container.querySelectorAll('.sc-act-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this shared cart? This cannot be undone.')) return;
        var id = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = '...';
        apiFetch(API_BASE + '/' + id + '?logged_in_customer_id=' + encodeURIComponent(customerId), 'DELETE')
          .then(function () {
            if (currentView === 'detail' && detailCartId === id) {
              currentView = 'dashboard';
              detailCartId = null;
            }
            load();
          })
          .catch(function () { btn.disabled = false; });
      });
    });

    // Details buttons
    container.querySelectorAll('.sc-act-details').forEach(function (btn) {
      btn.addEventListener('click', function () {
        detailCartId = btn.dataset.id;
        currentView = 'detail';
        render();
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // Back button
    var backBtn = document.getElementById('sc-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        currentView = 'dashboard';
        detailCartId = null;
        render();
      });
    }

    // Pagination
    var prevBtn = document.getElementById('sc-prev');
    var nextBtn = document.getElementById('sc-next');
    if (prevBtn) prevBtn.addEventListener('click', function () { if (page > 1) { page--; load(); } });
    if (nextBtn) nextBtn.addEventListener('click', function () { if (page < totalPages) { page++; load(); } });
  }

  // ── Kick off ──
  load();

  // ══════════════════════════════════════════════════════════════════════════
  //  CSS
  // ══════════════════════════════════════════════════════════════════════════
  function getCSS() {
    return '\
/* ── Variables ────────────────────────────────────────────────────── */\
:root {\
  --sc-primary: #008060;\
  --sc-primary-light: rgba(0,128,96,.1);\
  --sc-primary-hover: rgba(0,128,96,.85);\
  --sc-surface: #fff;\
  --sc-border: #e2e8f0;\
  --sc-text: #0f172a;\
  --sc-text-muted: #64748b;\
  --sc-danger: #dc2626;\
  --sc-danger-light: rgba(220,38,38,.08);\
  --sc-amber: #d97706;\
  --sc-amber-light: rgba(217,119,6,.1);\
  --sc-green: #15803d;\
  --sc-green-light: rgba(22,128,61,.1);\
  --sc-radius: 0.75rem;\
  --sc-radius-sm: 0.5rem;\
  --sc-shadow: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);\
  --sc-shadow-hover: 0 4px 12px rgba(0,0,0,.08);\
}\
\
/* ── Loading / Spinner ─────────────────────────────────────────────── */\
.sc-loading { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:180px; gap:12px; }\
@keyframes sc-spin { to { transform:rotate(360deg); } }\
.sc-spinner { width:28px; height:28px; border:3px solid var(--sc-border); border-top-color:var(--sc-primary); border-radius:50%; animation:sc-spin .7s linear infinite; }\
\
/* ── Header ─────────────────────────────────────────────────────────── */\
.sc-header { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:20px; flex-wrap:wrap; }\
.sc-title { font-size:1.5rem; font-weight:800; letter-spacing:-0.025em; color:var(--sc-text); margin:0; }\
.sc-subtitle { font-size:0.9375rem; color:var(--sc-text-muted); margin:2px 0 0; }\
\
/* ── Search ─────────────────────────────────────────────────────────── */\
.sc-search-bar { position:relative; max-width:400px; margin-bottom:20px; }\
.sc-search-icon { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--sc-text-muted); }\
.sc-search-input { width:100%; padding:9px 12px 9px 36px; border:1px solid var(--sc-border); border-radius:var(--sc-radius-sm); font-size:0.9375rem; outline:none; background:var(--sc-surface); color:var(--sc-text); transition:border-color .15s; font-family:inherit; }\
.sc-search-input:focus { border-color:var(--sc-primary); box-shadow:0 0 0 2px var(--sc-primary-light); }\
\
/* ── Grid ───────────────────────────────────────────────────────────── */\
.sc-grid { display:grid; grid-template-columns:1fr; gap:16px; }\
@media(min-width:640px){ .sc-grid { grid-template-columns:repeat(2,1fr); } }\
\
/* ── Card ───────────────────────────────────────────────────────────── */\
.sc-card { background:var(--sc-surface); border:1px solid var(--sc-border); border-radius:var(--sc-radius); padding:20px; display:flex; flex-direction:column; gap:16px; box-shadow:var(--sc-shadow); transition:box-shadow .2s, opacity .2s, transform .2s; }\
.sc-card:hover { box-shadow:var(--sc-shadow-hover); transform:translateY(-2px); }\
.sc-card-paused { opacity:0.72; }\
.sc-card-header { display:flex; justify-content:space-between; align-items:flex-start; }\
.sc-card-title { font-size:1.5rem; font-weight:700; color:var(--sc-text); margin:0; }\
.sc-card-date { font-size:1rem; color:var(--sc-text-muted); margin-top:2px; }\
\
/* ── Badge ──────────────────────────────────────────────────────────── */\
.sc-badge { display:inline-block; font-size:0.6875rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:4px 10px; border-radius:4px; white-space:nowrap; }\
.sc-badge-active { background:var(--sc-green-light); color:var(--sc-green); }\
.sc-badge-paused { background:var(--sc-amber-light); color:var(--sc-amber); }\
.sc-badge-expired { background:var(--sc-danger-light); color:var(--sc-danger); }\
.sc-badge-promo  { background:var(--sc-primary-light); color:var(--sc-primary); font-size:0.8125rem; }\
\
/* ── Metrics Strip ──────────────────────────────────────────────────── */\
.sc-metrics-strip { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; padding:12px 0; border-top:1px solid var(--sc-border); border-bottom:1px solid var(--sc-border); }\
.sc-metric { text-align:center; }\
.sc-metric-bordered { border-left:1px solid var(--sc-border); border-right:1px solid var(--sc-border); }\
.sc-metric-label { font-size:1rem; color:var(--sc-text-muted); text-transform:uppercase; letter-spacing:0.04em; font-weight:600; margin:0; }\
.sc-metric-value { font-size:1rem; font-weight:800; color:var(--sc-text); margin:2px 0 0; }\
\
/* ── Card Actions ───────────────────────────────────────────────────── */\
.sc-card-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }\
.sc-btn-copy { flex:1; }\
\
/* ── Buttons ────────────────────────────────────────────────────────── */\
.sc-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:8px 14px; border-radius:var(--sc-radius-sm); font-size:0.875rem; font-weight:600; border:none; cursor:pointer; transition:all .15s; font-family:inherit; line-height:1.3; }\
.sc-btn:disabled { opacity:0.5; cursor:not-allowed; }\
.sc-btn svg { flex-shrink:0; }\
.sc-btn-primary { background:var(--sc-primary); color:#fff; }\
.sc-btn-primary:hover:not(:disabled) { background:var(--sc-primary-hover); }\
.sc-btn-outline { background:transparent; border:1px solid var(--sc-border); color:var(--sc-text); }\
.sc-btn-outline:hover:not(:disabled) { background:#f8fafc; }\
.sc-btn-icon { padding:8px; background:#f1f5f9; color:var(--sc-text-muted); border-radius:var(--sc-radius-sm); }\
.sc-btn-icon:hover:not(:disabled) { background:#e2e8f0; }\
.sc-btn-resume { background:var(--sc-primary-light); color:var(--sc-primary); }\
.sc-btn-resume:hover:not(:disabled) { background:var(--sc-primary); color:#fff; }\
.sc-btn-pause { background:#f1f5f9; color:var(--sc-text-muted); }\
.sc-btn-pause:hover:not(:disabled) { background:#e2e8f0; }\
.sc-btn-delete { border:1px solid rgba(220,38,38,.2); color:var(--sc-danger); background:transparent; }\
.sc-btn-delete:hover:not(:disabled) { background:var(--sc-danger-light); }\
.sc-btn-danger { background:transparent; border:1px solid rgba(220,38,38,.25); color:var(--sc-danger); padding:10px 20px; }\
.sc-btn-danger:hover:not(:disabled) { background:var(--sc-danger-light); }\
\
/* ── Pagination ─────────────────────────────────────────────────────── */\
.sc-pagination { display:flex; justify-content:center; align-items:center; gap:16px; margin-top:32px; }\
.sc-page-info { font-size:0.9375rem; color:var(--sc-text-muted); }\
\
/* ── Empty / Error ──────────────────────────────────────────────────── */\
.sc-empty, .sc-error { text-align:center; padding:48px 16px; }\
.sc-empty h3, .sc-error h3 { font-size:1.125rem; font-weight:700; margin:0 0 8px; color:var(--sc-text); }\
.sc-empty p, .sc-error p { color:var(--sc-text-muted); font-size:0.9375rem; margin:0; }\
.sc-error { background:var(--sc-danger-light); border-radius:var(--sc-radius); }\
\
/* ══════════════════════════════════════════════════════════════════════ */\
/*  DETAIL VIEW                                                       */\
/* ══════════════════════════════════════════════════════════════════════ */\
.sc-detail { display:flex; flex-direction:column; gap:20px; }\
.sc-back-btn { display:inline-flex; align-items:center; gap:4px; background:none; border:none; color:var(--sc-primary); font-weight:600; font-size:0.9375rem; cursor:pointer; padding:4px 0; font-family:inherit; }\
.sc-back-btn:hover { text-decoration:underline; }\
.sc-detail-title-row { display:flex; align-items:center; justify-content:space-between; gap:16px; }\
\
/* Status card */\
.sc-status-card { display:flex; align-items:center; gap:16px; padding:16px; border-radius:var(--sc-radius); border:1px solid var(--sc-border); background:var(--sc-surface); flex-wrap:wrap; }\
.sc-status-card-info { flex:1; min-width:140px; }\
.sc-status-active { border-color:rgba(0,128,96,.2); background:var(--sc-primary-light); }\
.sc-status-expired { border-color:rgba(220,38,38,.2); background:var(--sc-danger-light); }\
.sc-status-title { font-weight:700; font-size:1rem; margin:0; }\
.sc-status-desc { font-size:0.875rem; color:var(--sc-text-muted); margin:2px 0 0; }\
\
/* Detail metrics */\
.sc-detail-metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }\
.sc-detail-metric-card { background:var(--sc-surface); border:1px solid var(--sc-border); border-radius:var(--sc-radius); padding:16px; display:flex; flex-direction:column; gap:4px; }\
.sc-detail-metric-value { font-size:1.5rem; font-weight:800; color:var(--sc-text); margin:0; }\
\
/* Share section */\
.sc-share-section { background:var(--sc-surface); border:1px solid var(--sc-border); border-radius:var(--sc-radius); padding:16px; }\
.sc-section-title { font-size:1.5rem; font-weight:700; margin:0 0 12px; display:flex; align-items:center; gap:6px; }\
.sc-section-title svg { color:var(--sc-primary); }\
.sc-share-row { display:flex; gap:8px; }\
.sc-share-url { flex:1; background:#f8fafc; border:1px solid var(--sc-border); border-radius:var(--sc-radius-sm); padding:8px 12px; font-size:0.875rem; color:var(--sc-text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\
\
/* QR section */\
.sc-qr-section { display:flex; align-items:center; gap:16px; padding:16px; border:1px solid var(--sc-border); border-radius:var(--sc-radius); background:var(--sc-surface); }\
.sc-qr-box { width:120px; height:120px; border:1px solid var(--sc-border); border-radius:var(--sc-radius-sm); padding:4px; background:#fff; flex-shrink:0; display:flex; align-items:center; justify-content:center; }\
.sc-qr-text h4 { font-size:1rem; font-weight:700; margin:0; }\
.sc-qr-text p { margin-top:4px; }\
\
/* Items section */\
.sc-items-section { background:var(--sc-surface); border:1px solid var(--sc-border); border-radius:var(--sc-radius); overflow:hidden; }\
.sc-items-section .sc-section-title { padding:16px 16px 0; }\
.sc-items-list { padding:0; }\
.sc-item-row { display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--sc-border); }\
.sc-item-row:last-child { border-bottom:none; }\
.sc-item-image { width:56px; height:56px; border-radius:var(--sc-radius-sm); object-fit:cover; border:1px solid var(--sc-border); flex-shrink:0; background:#f1f5f9; }\
.sc-item-placeholder { background:#e2e8f0; }\
.sc-item-info { flex:1; min-width:0; }\
.sc-item-name { font-weight:600; font-size:0.9375rem; color:var(--sc-text); margin:0; }\
.sc-item-pricing { text-align:right; flex-shrink:0; }\
.sc-item-price { font-weight:700; color:var(--sc-primary); font-size:0.9375rem; margin:0; }\
.sc-subtotal { display:flex; justify-content:space-between; padding:14px 16px; border-top:2px dashed var(--sc-border); font-weight:500; color:var(--sc-text-muted); }\
.sc-subtotal-value { font-size:1.1rem; font-weight:800; color:var(--sc-text); }\
\
/* Promo, expiry */\
.sc-promo-section { padding:16px; background:var(--sc-surface); border:1px solid var(--sc-border); border-radius:var(--sc-radius); }\
.sc-promo-list { display:flex; gap:8px; flex-wrap:wrap; }\
.sc-expiry-info { padding:12px 16px; background:var(--sc-surface); border:1px solid var(--sc-border); border-radius:var(--sc-radius); }\
\
/* Orders table */\
.sc-orders-section { background:var(--sc-surface); border:1px solid var(--sc-border); border-radius:var(--sc-radius); overflow:hidden; }\
.sc-orders-section .sc-section-title { padding:16px 16px 0; }\
.sc-orders-table { width:100%; border-collapse:collapse; font-size:0.875rem; }\
.sc-orders-table thead { background:#f8fafc; }\
.sc-orders-table th { padding:10px 16px; font-weight:600; text-transform:uppercase; font-size:0.75rem; letter-spacing:0.05em; color:var(--sc-text-muted); text-align:left; }\
.sc-orders-table td { padding:12px 16px; border-top:1px solid var(--sc-border); }\
.sc-orders-table tr:hover td { background:rgba(0,128,96,.03); }\
.sc-order-name { font-weight:600; color:var(--sc-primary); }\
\
/* Detail footer */\
.sc-detail-footer { padding-top:12px; display:flex; justify-content:flex-end; }\
\
/* Utility */\
.sc-text-muted { color:var(--sc-text-muted); font-size:0.875rem; margin:0; }\
.sc-text-right { text-align:right; }\
';
  }

})();
