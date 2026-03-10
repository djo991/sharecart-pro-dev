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

  function injectStyles() {
    if (document.getElementById('sc-account-styles')) return;
    var css = `
      .sc-acc-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 20px;
        margin-top: 16px;
      }
      .sc-acc-card {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        transition: box-shadow 0.2s ease, transform 0.2s ease;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      }
      .sc-acc-card:hover {
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
      }
      .sc-acc-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;
      }
      .sc-acc-title {
        font-weight: 600;
        font-size: 16px;
        color: #111827;
        margin: 0;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .sc-acc-date {
        font-size: 13px;
        color: #6b7280;
        margin-top: 4px;
      }
      .sc-acc-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
      }
      .sc-badge-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }
      .sc-badge-active { background: #ecfdf5; color: #065f46; }
      .sc-badge-active .sc-badge-dot { background: #10b981; }
      .sc-badge-paused { background: #fefce8; color: #854d0e; }
      .sc-badge-paused .sc-badge-dot { background: #eab308; }
      .sc-badge-expired { background: #fef2f2; color: #991b1b; }
      .sc-badge-expired .sc-badge-dot { background: #ef4444; }
      .sc-acc-stats {
        display: flex;
        gap: 16px;
        padding: 12px;
        background: #f9fafb;
        border-radius: 8px;
        margin-bottom: 16px;
      }
      .sc-stat-item {
        display: flex;
        flex-direction: column;
      }
      .sc-stat-val {
        font-weight: 600;
        font-size: 15px;
        color: #111827;
      }
      .sc-stat-label {
        font-size: 12px;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .sc-acc-actions {
        display: flex;
        gap: 8px;
        margin-top: auto;
      }
      .sc-btn {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        border: 1px solid transparent;
      }
      .sc-btn-primary {
        background: #111827;
        color: #ffffff;
      }
      .sc-btn-primary:hover {
        background: #374151;
      }
      .sc-btn-secondary {
        background: #ffffff;
        color: #374151;
        border-color: #d1d5db;
      }
      .sc-btn-secondary:hover:not(:disabled) {
        background: #f3f4f6;
      }
      .sc-btn-danger {
        background: #ffffff;
        color: #ef4444;
        border-color: #fecaca;
      }
      .sc-btn-danger:hover:not(:disabled) {
        background: #fef2f2;
        border-color: #fca5a5;
      }
      .sc-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .sc-empty-state {
        text-align: center;
        padding: 48px 20px;
        background: #f9fafb;
        border-radius: 12px;
        border: 1px dashed #d1d5db;
        margin-top: 16px;
      }
      .sc-empty-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 16px;
        color: #9ca3af;
      }
    `;
    var style = document.createElement('style');
    style.id = 'sc-account-styles';
    style.innerHTML = css;
    document.head.appendChild(style);
  }

  function renderCart(cart, idx) {
    var status = getStatus(cart);
    var badgeClass = status === 'Expired' ? 'sc-badge-expired' : status === 'Paused' ? 'sc-badge-paused' : 'sc-badge-active';
    var toggleLabel = cart.isActive ? 'Pause' : 'Resume';

    return `
      <div class="sc-acc-card" data-id="${esc(cart.id)}">
        <div class="sc-acc-header">
          <div>
            <h4 class="sc-acc-title">${esc(cart.name || 'Shared Cart')}</h4>
            <div class="sc-acc-date">Created ${formatDate(cart.createdAt)}</div>
          </div>
          <div class="sc-acc-badge ${badgeClass}">
            <span class="sc-badge-dot"></span>
            ${status}
          </div>
        </div>
        
        <div class="sc-acc-stats">
          <div class="sc-stat-item">
            <span class="sc-stat-val">${cart.impressions || 0}</span>
            <span class="sc-stat-label">Views</span>
          </div>
          <div class="sc-stat-item">
            <span class="sc-stat-val">${cart.completedPurchases || 0}</span>
            <span class="sc-stat-label">Orders</span>
          </div>
        </div>
        
        <div class="sc-acc-actions">
          <button class="sc-btn sc-btn-primary sc-acc-copy" data-url="${esc(cart.shareUrl)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
          ${status !== 'Expired' ? `
            <button class="sc-btn sc-btn-secondary sc-acc-toggle" data-id="${esc(cart.id)}" data-active="${cart.isActive}">
              ${toggleLabel}
            </button>
          ` : ''}
          <button class="sc-btn sc-btn-danger sc-acc-delete" data-id="${esc(cart.id)}">
            Delete
          </button>
        </div>
      </div>
    `;
  }

  function renderList(carts) {
    if (carts.length === 0) {
      return `
        <div class="sc-empty-state">
          <svg class="sc-empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 style="margin:0 0 8px;font-size:16px;font-weight:600;color:#111827;">No shared carts yet</h3>
          <p style="margin:0;color:#6b7280;font-size:14px;">Build a cart and click the share button to get started.</p>
        </div>
      `;
    }
    var html = '<div class="sc-acc-grid">';
    for (var i = 0; i < carts.length; i++) {
      html += renderCart(carts[i], i);
    }
    html += '</div>';
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
        injectStyles();
        allCarts = data.shareCarts || [];
        totalPages = data.totalPages || 1;
        container.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
          '<h2 style="font-size:24px;font-weight:700;margin:0;color:#111827;">My Shared Carts</h2>' +
          '</div>' +
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
