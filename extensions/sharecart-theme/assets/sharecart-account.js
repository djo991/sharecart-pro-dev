(function () {
  'use strict';

  var API_BASE = '/apps/sharecart/api/storefront/my-carts';
  var container = document.getElementById('sharecart-account-widget');
  if (!container) return;

  var customerId = container.dataset.customerId || '';
  if (!customerId) {
    container.innerHTML = '';
    return;
  }

  var page = 1;
  var totalPages = 1;
  var allCarts = [];

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

  function copyToClipboard(text, btn) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        var prev = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = prev; }, 2000);
      });
    }
  }

  // ── Render ──

  function renderCart(cart, idx) {
    var status = getStatus(cart);
    var statusColor = status === 'Expired' ? '#b91c1c' : status === 'Paused' ? '#92400e' : '#166534';
    var statusBg    = status === 'Expired' ? '#fee2e2' : status === 'Paused' ? '#fef3c7' : '#dcfce7';
    return (
      '<div class="sc-account-cart" data-id="' + esc(cart.id) + '" style="' +
        'border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;background:#fff;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
          '<div>' +
            '<div style="font-weight:600;font-size:15px;margin-bottom:4px;">' + esc(cart.name || 'Shared Cart') + '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
              '<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:500;' +
                'background:' + statusBg + ';color:' + statusColor + ';">' + status + '</span>' +
              '<span style="color:#6b7280;font-size:13px;">Created ' + formatDate(cart.createdAt) + '</span>' +
              (cart.impressions ? '<span style="color:#6b7280;font-size:13px;">' + cart.impressions + ' views</span>' : '') +
              (cart.completedPurchases ? '<span style="color:#6b7280;font-size:13px;">' + cart.completedPurchases + ' orders</span>' : '') +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button class="sc-acc-copy" data-url="' + esc(cart.shareUrl) + '" ' +
              'style="padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid #d1d5db;background:#fff;cursor:pointer;">Copy link</button>' +
            (status !== 'Expired'
              ? '<button class="sc-acc-toggle" data-id="' + esc(cart.id) + '" data-active="' + cart.isActive + '" ' +
                  'style="padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid #d1d5db;background:#fff;cursor:pointer;">' +
                  (cart.isActive ? 'Pause' : 'Resume') + '</button>'
              : '') +
            '<button class="sc-acc-delete" data-id="' + esc(cart.id) + '" ' +
              'style="padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid #fca5a5;background:#fff;color:#dc2626;cursor:pointer;">Delete</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderList(carts) {
    if (carts.length === 0) {
      return '<p style="color:#6b7280;">No shared carts yet. Share your cart from the cart page to see it here.</p>';
    }
    var html = '';
    for (var i = 0; i < carts.length; i++) {
      html += renderCart(carts[i], i);
    }
    return html;
  }

  function renderPagination() {
    if (totalPages <= 1) return '';
    return (
      '<div style="display:flex;align-items:center;gap:12px;margin-top:8px;">' +
        '<button id="sc-acc-prev" ' + (page <= 1 ? 'disabled' : '') +
          ' style="padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid #d1d5db;' +
          'background:' + (page <= 1 ? '#f3f4f6' : '#fff') + ';cursor:' + (page <= 1 ? 'default' : 'pointer') + ';">Previous</button>' +
        '<span style="color:#6b7280;font-size:13px;">Page ' + page + ' of ' + totalPages + '</span>' +
        '<button id="sc-acc-next" ' + (page >= totalPages ? 'disabled' : '') +
          ' style="padding:6px 14px;font-size:13px;border-radius:6px;border:1px solid #d1d5db;' +
          'background:' + (page >= totalPages ? '#f3f4f6' : '#fff') + ';cursor:' + (page >= totalPages ? 'default' : 'pointer') + ';">Next</button>' +
      '</div>'
    );
  }

  // ── Load & render ──

  function load() {
    container.innerHTML = '<p style="color:#6b7280;">Loading shared carts...</p>';
    var url = API_BASE + '?logged_in_customer_id=' + encodeURIComponent(customerId) + '&page=' + page + '&perPage=20';
    apiFetch(url)
      .then(function (data) {
        allCarts = data.shareCarts || [];
        totalPages = data.totalPages || 1;
        container.innerHTML =
          '<h3 style="font-size:16px;font-weight:600;margin:0 0 12px;">Shared Carts</h3>' +
          renderList(allCarts) +
          renderPagination();
        bindEvents();
      })
      .catch(function (err) {
        console.error('[ShareCart Account]', err);
        container.innerHTML = '<p style="color:#dc2626;">Could not load shared carts.</p>';
      });
  }

  // ── Event binding ──

  function bindEvents() {
    // Copy buttons
    container.querySelectorAll('.sc-acc-copy').forEach(function (btn) {
      btn.addEventListener('click', function () { copyToClipboard(btn.dataset.url, btn); });
    });

    // Toggle buttons
    container.querySelectorAll('.sc-acc-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = '...';
        apiFetch('/apps/sharecart/api/storefront/my-carts/' + id + '/toggle', 'PATCH')
          .then(function () { load(); })
          .catch(function () { btn.disabled = false; btn.textContent = btn.dataset.active === 'true' ? 'Pause' : 'Resume'; });
      });
    });

    // Delete buttons
    container.querySelectorAll('.sc-acc-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this shared cart? This cannot be undone.')) return;
        var id = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = '...';
        apiFetch('/apps/sharecart/api/storefront/my-carts/' + id, 'DELETE')
          .then(function () { load(); })
          .catch(function () { btn.disabled = false; btn.textContent = 'Delete'; });
      });
    });

    // Pagination
    var prevBtn = document.getElementById('sc-acc-prev');
    var nextBtn = document.getElementById('sc-acc-next');
    if (prevBtn) prevBtn.addEventListener('click', function () { if (page > 1) { page--; load(); } });
    if (nextBtn) nextBtn.addEventListener('click', function () { if (page < totalPages) { page++; load(); } });
  }

  // Kick off
  load();
})();
