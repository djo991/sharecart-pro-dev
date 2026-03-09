(function () {
  'use strict';

  // Wait for DB-driven config to merge before initialising
  var ready = window.__sharecartReady;
  if (ready && typeof ready.then === 'function') {
    ready.then(init).catch(init);
  } else {
    init();
  }

  function init() {
    var sc = window.__sharecart || {};

    // Check visibility rules before initializing
    function shouldShowButton() {
      if (sc.visibilityMode === 'all') return true;
      if (!sc.customerLoggedIn) return false;
      if (sc.visibilityMode === 'logged_in') return true;
      if (sc.visibilityMode === 'tagged') {
        var tags = sc.customerTags || [];
        return tags.indexOf(sc.requiredTag) >= 0;
      }
      return false;
    }

    if (!shouldShowButton()) {
      // Hide the App Block button if present
      var wrapper = document.getElementById('sharecart-btn-wrapper');
      if (wrapper) wrapper.style.display = 'none';
      return;
    }

    var shopDomain = sc.shop || '';
    var appUrl = sc.appUrl || '';
    var customerId = sc.customerId || '';
    var customerEmail = sc.customerEmail || '';
    var enabledChannels = ['link', 'whatsapp', 'facebook', 'twitter', 'email'];

    // Feature toggles from merchant settings (injected by sharecart-init.liquid)
    var showNameField = sc.showNameField !== false;
    var showDescriptionField = sc.showDescriptionField !== false;
    var showPromoField = sc.showPromoField === true;
    var showExpiryField = sc.showExpiryField !== false;

    // If App Block is present, read config from data attributes (theme editor defaults)
    // then override with DB-driven values from sc (already merged via __sharecartReady)
    var wrapper = document.getElementById('sharecart-btn-wrapper');
    if (wrapper) {
      shopDomain = wrapper.dataset.shop || shopDomain;
      customerId = wrapper.dataset.customer || customerId;
      customerEmail = wrapper.dataset.customerEmail || customerEmail;
      appUrl = wrapper.dataset.appUrl || appUrl;

      // Channels: DB config wins over theme editor data attr
      var chSrc = sc.enabledChannels || wrapper.dataset.channels;
      if (chSrc) {
        enabledChannels = chSrc.split(',').map(function (c) { return c.trim(); }).filter(Boolean);
      }

      // Apply DB-driven button appearance (label + colors)
      var openBtn = document.getElementById('sharecart-open-btn');
      if (openBtn) {
        var btnColor = sc.buttonColor || wrapper.dataset.buttonColor || '#000000';
        var btnTxtColor = sc.buttonTextColor || wrapper.dataset.buttonTextColor || '#ffffff';
        var btnLabel = sc.buttonLabel || wrapper.dataset.buttonLabel || 'Share Cart';
        openBtn.style.backgroundColor = btnColor;
        openBtn.style.color = btnTxtColor;
        openBtn.style.borderColor = btnColor;
        var labelEl = openBtn.querySelector('.sc-btn-label');
        if (labelEl) labelEl.textContent = btnLabel;
      }
    }

    var currentShareUrl = '';

    // ── Channel definitions ──
    var CHANNEL_CONFIG = {
      link: {
        label: 'Copy Link',
        color: '#6b7280',
        icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
      },
      whatsapp: {
        label: 'WhatsApp',
        color: '#25D366',
        icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'
      },
      facebook: {
        label: 'Facebook',
        color: '#1877F2',
        icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>'
      },
      twitter: {
        label: 'X (Twitter)',
        color: '#000000',
        icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="#000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>'
      },
      email: {
        label: 'Email',
        color: '#EA4335',
        icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EA4335" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>'
      }
    };

    // ── DOM references (lazily resolved) ──
    var overlay, formFields, generateBtn, loadingEl, errorEl, errorMsg,
      resultEl, linkInput, copyBtn, channelGrid, regenerateLink;

    function resolveModalEls() {
      overlay = document.getElementById('sharecart-modal-overlay');
      formFields = document.getElementById('sharecart-form-fields');
      generateBtn = document.getElementById('sharecart-generate-btn');
      loadingEl = document.getElementById('sharecart-loading');
      errorEl = document.getElementById('sharecart-error');
      errorMsg = document.getElementById('sharecart-error-msg');
      resultEl = document.getElementById('sharecart-result');
      linkInput = document.getElementById('sharecart-link-input');
      copyBtn = document.getElementById('sharecart-copy-btn');
      channelGrid = document.getElementById('sharecart-channel-grid');
      regenerateLink = document.getElementById('sharecart-regenerate');
    }

    // ── Build form fields HTML ──
    function buildFormFieldsHtml() {
      var html = '';
      if (showNameField) {
        html += '<div class="sharecart-form-group">' +
          '<label for="sharecart-name-input">Cart name</label>' +
          '<input id="sharecart-name-input" type="text" placeholder="e.g., Birthday Gifts" class="sharecart-form-input" />' +
          '</div>';
      }
      if (showDescriptionField) {
        html += '<div class="sharecart-form-group">' +
          '<label for="sharecart-desc-input">Description</label>' +
          '<textarea id="sharecart-desc-input" placeholder="e.g., Best sellers for her" class="sharecart-form-input" rows="2"></textarea>' +
          '</div>';
      }
      if (showPromoField) {
        html += '<div class="sharecart-form-group">' +
          '<label for="sharecart-promo-input">Promo code</label>' +
          '<input id="sharecart-promo-input" type="text" placeholder="e.g., SAVE20" class="sharecart-form-input" />' +
          '</div>';
      }
      if (showExpiryField) {
        html += '<div class="sharecart-form-group">' +
          '<label for="sharecart-expiry-input">Expires in</label>' +
          '<select id="sharecart-expiry-input" class="sharecart-form-input">' +
          '<option value="">Never</option>' +
          '<option value="1">1 day</option>' +
          '<option value="7">7 days</option>' +
          '<option value="30">30 days</option>' +
          '<option value="90">90 days</option>' +
          '</select>' +
          '</div>';
      }
      return html;
    }

    // ── Ensure modal HTML exists (create dynamically if App Block isn't present) ──
    function ensureModal() {
      if (document.getElementById('sharecart-modal-overlay')) {
        resolveModalEls();
        return;
      }

      var formHtml = buildFormFieldsHtml();
      var hasFormFields = formHtml.length > 0;

      var html =
        '<div id="sharecart-modal-overlay" class="sharecart-modal-overlay" style="display:none;">' +
        '<div class="sharecart-modal">' +
        '<div class="sharecart-modal-header">' +
        '<h2 class="sharecart-modal-title">Share your cart</h2>' +
        '<button id="sharecart-modal-close" class="sharecart-modal-close" type="button" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="sharecart-modal-body">' +
        (hasFormFields
          ? '<div id="sharecart-form-fields" class="sharecart-form-fields">' + formHtml + '</div>' +
          '<button id="sharecart-generate-btn" type="button" class="sharecart-generate-btn">Generate Share Link</button>'
          : '') +
        '<div id="sharecart-loading" class="sharecart-loading" style="display:none;"><div class="sharecart-spinner"></div><p>Creating share link...</p></div>' +
        '<div id="sharecart-error" class="sharecart-error" style="display:none;"><p id="sharecart-error-msg"></p></div>' +
        '<div id="sharecart-result" style="display:none;">' +
        '<div id="sharecart-qr-code" style="text-align:center;margin-bottom:16px;"></div>' +
        '<div class="sharecart-link-row">' +
        '<input id="sharecart-link-input" type="text" readonly class="sharecart-link-input" />' +
        '<button id="sharecart-copy-btn" type="button" class="sharecart-copy-btn">Copy</button>' +
        '</div>' +
        '<div class="sharecart-channel-grid" id="sharecart-channel-grid"></div>' +
        '<a href="#" id="sharecart-regenerate" class="sharecart-regenerate">Generate new share link</a>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>';

      // Ensure styles are loaded
      if (!document.querySelector('link[href*="sharecart-styles"]')) {
        var styleUrl = sc.stylesUrl;
        if (styleUrl) {
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = styleUrl;
          document.head.appendChild(link);
        }
      }

      var container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container.firstChild);

      resolveModalEls();
      bindModalEvents();
    }

    // ── Bind all modal events ──
    function bindModalEvents() {
      var closeBtn = document.getElementById('sharecart-modal-close');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (overlay) overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });
      if (copyBtn) copyBtn.addEventListener('click', copyLink);
      if (generateBtn) generateBtn.addEventListener('click', handleGenerate);
      if (regenerateLink) regenerateLink.addEventListener('click', function (e) {
        e.preventDefault();
        resetToForm();
      });
    }

    // ── Copy link handler ──
    function copyLink() {
      if (!currentShareUrl) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentShareUrl).then(function () {
          showToast('Link copied!');
        });
      } else {
        linkInput.select();
        document.execCommand('copy');
        showToast('Link copied!');
      }
    }

    // ── Collect form data ──
    function collectFormData() {
      var data = {};
      var nameInput = document.getElementById('sharecart-name-input');
      var descInput = document.getElementById('sharecart-desc-input');
      var promoInput = document.getElementById('sharecart-promo-input');
      var expiryInput = document.getElementById('sharecart-expiry-input');

      if (nameInput) data.name = nameInput.value.trim();
      if (descInput) data.description = descInput.value.trim();
      if (promoInput) data.promoCode = promoInput.value.trim();
      if (expiryInput && expiryInput.value) {
        data.expiryDays = parseInt(expiryInput.value, 10);
      }
      if (expiryInput && !expiryInput.value) {
        data.neverExpires = true;
      }
      return data;
    }

    // ── Reset modal to form state ──
    function resetToForm() {
      currentShareUrl = '';
      if (formFields) formFields.style.display = 'block';
      if (generateBtn) generateBtn.style.display = 'block';
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';
      if (resultEl) resultEl.style.display = 'none';
    }

    // ── Build channel buttons ──
    function buildChannelButtons() {
      channelGrid.innerHTML = '';
      enabledChannels.forEach(function (ch) {
        if (ch === 'link') return;
        var config = CHANNEL_CONFIG[ch];
        if (!config) return;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sharecart-channel-btn';
        btn.innerHTML = '<span class="sharecart-channel-icon">' + config.icon + '</span>' + config.label;
        btn.addEventListener('click', function () { shareToChannel(ch); });
        channelGrid.appendChild(btn);
      });
    }

    // ── Read cart items ──
    function getCartItems() {
      return fetch('/cart.js')
        .then(function (r) { return r.json(); })
        .then(function (cart) {
          return cart.items.map(function (item) {
            return {
              variantId: item.variant_id,
              productId: item.product_id,
              quantity: item.quantity,
              title: item.title || '',
              variantTitle: item.variant_title || '',
              handle: item.handle || '',
              price: item.price,          // in cents
              image: item.image || '',
              properties: item.properties || {}
            };
          });
        });
    }

    // ── Create share link via app API ──
    function createShareLink(items, channel, formData) {
      var apiBase = appUrl || '';
      var url = apiBase + '/api/share';
      var body = {
        shop: shopDomain,
        items: items,
        customerId: customerId || null,
        customerEmail: customerEmail || null,
        channel: channel || 'link',
        currentParams: window.location.search || '',
        customContext: sc.customContext || {}
      };

      // Merge form data
      if (formData) {
        if (formData.name) body.name = formData.name;
        if (formData.description) body.description = formData.description;
        if (formData.promoCode) body.promoCode = formData.promoCode;
        if (formData.expiryDays) body.expiryDays = formData.expiryDays;
        if (formData.neverExpires) body.neverExpires = true;
      }

      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (r) {
        return r.json().then(function (data) {
          // Because Shopify Proxy requires us to return HTTP 200 for validation errors,
          // we must explicitly check for the presence of data.error even if r.ok is true
          if (!r.ok || data.error) {
            throw new Error(data.error || 'Failed to create share link (HTTP ' + r.status + ')');
          }
          return data;
        }).catch(function (err) {
          // If JSON parsing fails, throw generic error or propagate the structured one
          throw new Error(err.message || 'Failed to create share link (HTTP ' + r.status + ')');
        });
      });
    }

    // ── Handle "Generate Share Link" button click ──
    function handleGenerate() {
      var formData = collectFormData();

      // Hide form, show loading
      if (formFields) formFields.style.display = 'none';
      if (generateBtn) generateBtn.style.display = 'none';
      loadingEl.style.display = 'block';
      errorEl.style.display = 'none';
      if (resultEl) resultEl.style.display = 'none';

      getCartItems()
        .then(function (items) {
          if (items.length === 0) throw new Error('Your cart is empty.');
          return createShareLink(items, 'link', formData);
        })
        .then(function (data) {
          currentShareUrl = data.shareUrl;
          linkInput.value = data.shareUrl;

          var qrEl = document.getElementById('sharecart-qr-code');
          if (qrEl) {
            qrEl.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(data.shareUrl) + '" alt="QR Code" style="width:120px;height:120px;margin:0 auto;display:block;border-radius:8px;border:1px solid #eee;" />';
          }

          loadingEl.style.display = 'none';
          if (resultEl) resultEl.style.display = 'block';
          buildChannelButtons();
        })
        .catch(function (err) {
          loadingEl.style.display = 'none';
          errorEl.style.display = 'block';
          errorMsg.textContent = err.message || 'Something went wrong. Please try again.';
          // Show form again so user can retry
          if (formFields) formFields.style.display = 'block';
          if (generateBtn) generateBtn.style.display = 'block';
        });
    }

    // ── Share to a specific channel ──
    function shareToChannel(channel) {
      if (!currentShareUrl) return;

      var text = sc.defaultShareMessage || 'Check out my cart!';
      var encodedUrl = encodeURIComponent(currentShareUrl);
      var encodedText = encodeURIComponent(text);
      var shareWindow;

      switch (channel) {
        case 'whatsapp':
          shareWindow = 'https://wa.me/?text=' + encodedText + '%20' + encodedUrl;
          break;
        case 'facebook':
          shareWindow = 'https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl;
          break;
        case 'twitter':
          shareWindow = 'https://twitter.com/intent/tweet?text=' + encodedText + '&url=' + encodedUrl;
          break;
        case 'email':
          window.location.href = 'mailto:?subject=' + encodedText + '&body=' + encodedText + '%20' + encodedUrl;
          return;
        default:
          return;
      }

      window.open(shareWindow, '_blank', 'width=600,height=400');
      logShareEvent('created', channel);
    }

    // ── Log events ──
    function logShareEvent(eventType, channel) {
      var apiBase = appUrl || '';
      fetch(apiBase + '/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: shopDomain,
          token: '',
          eventType: eventType,
          channel: channel || 'link'
        })
      }).catch(function () { }); // fire-and-forget
    }

    // ── Show toast notification ──
    function showToast(message) {
      var existing = document.querySelector('.sharecart-toast');
      if (existing) existing.remove();

      var toast = document.createElement('div');
      toast.className = 'sharecart-toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(function () { toast.remove(); }, 2500);
    }

    // ── Modal open/close ──
    function openModal() {
      ensureModal();
      overlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';

      // If no form fields are configured, go straight to generation
      var hasForm = formFields && formFields.children.length > 0;
      if (hasForm) {
        resetToForm();
      } else {
        handleGenerate();
      }
    }

    function closeModal() {
      if (overlay) overlay.style.display = 'none';
      document.body.style.overflow = '';
    }

    // ── Expose global entry point for drawer + any other trigger ──
    sc.openShareModal = openModal;
    window.__sharecart = sc;

    // ── Bind App Block button if present ──
    var openBtn = document.getElementById('sharecart-open-btn');
    if (openBtn) {
      openBtn.addEventListener('click', openModal);
      resolveModalEls();
      var closeBtnEl = document.getElementById('sharecart-modal-close');
      if (closeBtnEl) closeBtnEl.addEventListener('click', closeModal);
      if (overlay) overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });
      if (copyBtn) copyBtn.addEventListener('click', copyLink);
      if (generateBtn) generateBtn.addEventListener('click', handleGenerate);
      if (regenerateLink) regenerateLink.addEventListener('click', function (e) {
        e.preventDefault();
        resetToForm();
      });
    }

    // ── Close on Escape key ──
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var modal = document.getElementById('sharecart-modal-overlay');
        if (modal && modal.style.display !== 'none') closeModal();
      }
    });
  } // end init()
})();
