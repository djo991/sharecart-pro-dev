(function () {
  'use strict';

  var SC_PARAM = '_sc';

  // Only run if the URL has a _sc token
  var params = new URLSearchParams(window.location.search);
  var token = params.get(SC_PARAM);
  if (!token) return;

  var config = window.__sharecart || {};
  var appUrl = config.appUrl || '';

  // Prevent double-restore: check if we've already processed this token
  var RESTORE_KEY = '__sc_restored';
  try {
    if (sessionStorage.getItem(RESTORE_KEY) === token) return;
  } catch (e) { }

  // Fetch cart data from the app API
  fetch(appUrl + '/api/share/' + encodeURIComponent(token))
    .then(function (r) {
      if (!r.ok) throw new Error('Share link not found');
      return r.json();
    })
    .then(function (data) {
      if (data.expired) {
        showRestoreToast('This share link has expired.');
        return;
      }

      if (!data.items || data.items.length === 0) {
        showRestoreToast('This shared cart is empty.');
        return;
      }

      // Mark as restoring to prevent duplicate processing
      try {
        sessionStorage.setItem(RESTORE_KEY, token);
      } catch (e) { }

      var target = config.redirectTarget || 'cart';
      var redirectUrl = '/cart';
      if (target === 'home') redirectUrl = '/';
      if (target === 'checkout') redirectUrl = '/checkout';

      // Preserve existing parameters (like UTMs) and forward them to the final URL
      params.delete(SC_PARAM);
      var remainingParams = params.toString();
      if (remainingParams) {
        redirectUrl += (redirectUrl.indexOf('?') !== -1 ? '&' : '?') + remainingParams;
      }

      if (target === 'preview') {
        showPreviewModal(data.items, config, function () {
          performRestore(data.items, config, token, data.promoCodes, redirectUrl);
        });
      } else {
        var loadingMsg = 'We are unpacking the items and will take you to the cart page automatically';
        if (target === 'home') loadingMsg = 'We are unpacking your cart - the items will be automatically added';
        if (target === 'checkout') loadingMsg = 'We are unpacking your cart and will take you to checkout automatically';

        showLoadingOverlay(loadingMsg);
        performRestore(data.items, config, token, data.promoCodes, redirectUrl);
      }
    })
    .catch(function (err) {
      console.error('[ShareCart] Restore error:', err);
      showRestoreToast('Could not restore the shared cart.');
      var ol = document.getElementById('sc-loading-overlay');
      if (ol) ol.remove();
    });

  function performRestore(items, config, token, promoCodes, redirectUrl) {
    var appUrl = config.appUrl || '';

    // Clear existing cart, then add items sequentially
    return fetch('/cart/clear.js', { method: 'POST' })
      .catch(function () { })
      .then(function () {
        return addItemsSequentially(items);
      })
      .then(function (results) {
        var added = results.filter(function (r) { return r.success; }).length;
        var failed = results.filter(function (r) { return !r.success; }).length;

        var attributes = { _sc_token: token };
        if (promoCodes && promoCodes.length > 0) {
          attributes._sc_promo = promoCodes.join(',');
        }

        try {
          var paramsObj = new URLSearchParams(window.location.search);
          paramsObj.delete(SC_PARAM);
          paramsObj.forEach(function (value, key) {
            attributes[key] = value;
          });
        } catch (e) { }

        return fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attributes: attributes })
        }).catch(function () { }).then(function () {
          // Log the restore event
          logEvent('cart_restored');

          if (failed > 0) {
            showRestoreToast(added + ' item(s) added. ' + failed + ' item(s) unavailable.');
          } else {
            showRestoreToast(added + ' item(s) added to your cart!');
          }

          var ol = document.getElementById('sc-loading-overlay');
          if (ol) ol.remove();

          cleanUrl();

          setTimeout(function () {
            window.location.href = redirectUrl;
          }, 1500);
        });
      });
  }

  function showPreviewModal(items, config, onConfirm) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;backdrop-filter:blur(4px);';

    var modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;padding:24px;border-radius:12px;width:90%;max-width:440px;box-shadow:0 20px 40px rgba(0,0,0,0.2);display:flex;flex-direction:column;max-height:85vh;';

    var title = document.createElement('h2');
    title.textContent = 'Shared Cart';
    title.style.cssText = 'margin:0 0 16px 0;font-size:20px;font-weight:600;color:#111;text-align:center;';

    var list = document.createElement('ul');
    list.style.cssText = 'margin:0 0 24px 0;padding:0;list-style:none;overflow-y:auto;flex-grow:1;border-top:1px solid #eee;border-bottom:1px solid #eee;';

    items.forEach(function (item) {
      var li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;padding:12px 0;border-bottom:1px solid #f5f5f5;gap:12px;';
      if (item === items[items.length - 1]) li.style.borderBottom = 'none';

      var imgHTML = '';
      if (item.image) {
        imgHTML = '<img src="' + item.image + '" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid #eee;" />';
      } else {
        imgHTML = '<div style="width:50px;height:50px;background:#f5f5f5;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#999;font-size:10px;">No img</div>';
      }

      var details = document.createElement('div');
      details.style.cssText = 'flex-grow:1;min-width:0;';

      var nameText = item.title || ('Variant ' + item.variantId);
      var variantText = item.variantTitle && item.variantTitle !== 'Default Title' ? '<div style="color:#666;font-size:13px;margin-top:2px;">' + item.variantTitle + '</div>' : '';

      details.innerHTML = '<div style="font-weight:500;color:#333;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + nameText + '</div>' + variantText;

      var qty = document.createElement('div');
      qty.style.cssText = 'font-weight:600;color:#111;font-size:14px;white-space:nowrap;';
      qty.textContent = 'x' + item.quantity;

      li.innerHTML = imgHTML;
      li.appendChild(details);
      li.appendChild(qty);
      list.appendChild(li);
    });

    var btnConfig = {
      color: config.buttonColor || '#000',
      text: config.buttonTextColor || '#fff'
    };

    var btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;gap:12px;margin-top:auto;';

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'flex:1;padding:12px;background:#f5f5f5;color:#333;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:15px;transition:background 0.2s;';
    cancelBtn.onmouseover = function () { cancelBtn.style.background = '#e5e5e5'; };
    cancelBtn.onmouseout = function () { cancelBtn.style.background = '#f5f5f5'; };
    cancelBtn.onclick = function () {
      overlay.remove();
      cleanUrl();
    };

    var confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Unpack Cart';
    confirmBtn.style.cssText = 'flex:2;padding:12px;background:' + btnConfig.color + ';color:' + btnConfig.text + ';border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:15px;transition:opacity 0.2s;';
    confirmBtn.onmouseover = function () { confirmBtn.style.opacity = '0.9'; };
    confirmBtn.onmouseout = function () { confirmBtn.style.opacity = '1'; };
    confirmBtn.onclick = function () {
      confirmBtn.innerHTML = '<span class="sc-spinner" style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:sc-spin 0.75s linear infinite;vertical-align:middle;margin-right:8px;"></span>Loading...';
      if (!document.getElementById('sc-preview-style')) {
        var style = document.createElement('style');
        style.id = 'sc-preview-style';
        style.textContent = '@keyframes sc-spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      cancelBtn.style.opacity = '0.5';
      onConfirm();
    };

    btnGroup.appendChild(cancelBtn);
    btnGroup.appendChild(confirmBtn);

    modal.appendChild(title);
    modal.appendChild(list);
    modal.appendChild(btnGroup);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function showLoadingOverlay(message) {
    var overlay = document.createElement('div');
    overlay.id = 'sc-loading-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.9);z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;backdrop-filter:blur(4px);';

    var spinner = document.createElement('div');
    spinner.style.cssText = 'width:40px;height:40px;border:3px solid #eee;border-top-color:#111;border-radius:50%;animation:sc-spin 0.8s linear infinite;margin-bottom:24px;';

    var text = document.createElement('div');
    text.textContent = message || 'Restoring your cart...';
    text.style.cssText = 'font-size:16px;line-height:1.5;font-weight:600;color:#111;max-width:320px;';

    if (!document.getElementById('sc-preview-style')) {
      var style = document.createElement('style');
      style.id = 'sc-preview-style';
      style.textContent = '@keyframes sc-spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }

    overlay.appendChild(spinner);
    overlay.appendChild(text);
    document.body.appendChild(overlay);
  }

  // ── Add items one at a time ──
  function addItemsSequentially(items) {
    var results = [];
    var chain = Promise.resolve();

    items.forEach(function (item) {
      chain = chain.then(function () {
        return fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.variantId,
            quantity: item.quantity,
            properties: item.properties || {}
          })
        })
          .then(function (r) {
            results.push({ success: r.ok, item: item });
          })
          .catch(function () {
            results.push({ success: false, item: item });
          });
      });
    });

    return chain.then(function () { return results; });
  }

  // ── Log event to app API ──
  function logEvent(eventType) {
    var shopDomain = config.shop || '';
    fetch(appUrl + '/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: shopDomain,
        token: token,
        eventType: eventType,
        channel: null
      })
    }).catch(function () { }); // fire-and-forget
  }

  // ── Remove _sc param from URL without reload ──
  function cleanUrl() {
    if (!window.history || !window.history.replaceState) return;
    var url = new URL(window.location.href);
    url.searchParams.delete(SC_PARAM);
    window.history.replaceState({}, document.title, url.toString());
  }

  // ── Toast UI for restore status ──
  function showRestoreToast(message) {
    var toast = document.createElement('div');
    toast.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:#1a1a1a;color:#fff;padding:14px 28px;border-radius:8px;' +
      'font-size:14px;font-weight:500;z-index:10000;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.15);';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 4000);
  }
})();
