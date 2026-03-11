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
    console.log('[ShareCart Debug] Drawer init started');
    var sc = window.__sharecart || {};

    // Check visibility rules before proceeding
    if (!shouldShowButton()) {
      console.log('[ShareCart Debug Drawer] shouldShowButton returned false. visibilityMode:', sc.visibilityMode, 'loggedIn:', sc.customerLoggedIn);
      // return; // REMOVED EARLY RETURN TO FORCE EVENT BINDING
    }
    console.log('[ShareCart Debug Drawer] shouldShowButton returned true');

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

    // Common cart drawer selectors across popular Shopify themes
    var DRAWER_SELECTORS = [
      'cart-drawer',                   // Dawn (custom element)
      '[data-cart-drawer]',            // Common data attribute
      '#CartDrawer',                   // Impulse, some older themes
      '.cart-drawer',                  // Generic class
      '.drawer[data-drawer="cart"]',   // Dawn variant
      '.js-drawer[data-drawer="cart"]',// Legacy themes
      '[data-drawer="cart"]',          // Data attribute variant
      '.mini-cart',                    // Some premium themes
      '.side-cart',                    // Side cart themes
      '#cart-drawer',                  // ID variant
      '.cart-sidebar',                 // Sidebar cart
      'aside[data-cart]'               // Aside element
    ];

    // Selectors for the area where we should insert the button (near checkout/actions)
    var ACTION_SELECTORS = [
      '.cart-drawer__footer',
      '[data-cart-drawer-footer]',
      '.drawer__footer',
      '.cart-drawer__cta',
      '.mini-cart__footer',
      '.side-cart__footer',
      '[name="checkout"]',
      'button[type="submit"]',
      'form[action="/cart"]'
    ];

    var INJECTED_ATTR = 'data-sharecart-injected';

    function findCartDrawer() {
      for (var i = 0; i < DRAWER_SELECTORS.length; i++) {
        var el = document.querySelector(DRAWER_SELECTORS[i]);
        if (el) return el;
      }
      return null;
    }

    function isDrawerVisible(drawer) {
      if (!drawer) return false;
      var style = window.getComputedStyle(drawer);
      // Check common visibility patterns
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden' && style.opacity === '0') return false;
      if (drawer.hasAttribute('hidden')) return false;
      // Check aria-hidden
      if (drawer.getAttribute('aria-hidden') === 'true') return false;
      // Check open attribute (for <details> or custom elements like Dawn's cart-drawer)
      if (drawer.tagName && drawer.tagName.toLowerCase() === 'cart-drawer') {
        // Dawn's cart-drawer uses an "open" attribute
        if (!drawer.hasAttribute('open') && style.transform && style.transform.indexOf('translate') >= 0) {
          return false;
        }
      }
      return true;
    }

    function createShareButton() {
      var btnColor = sc.buttonColor || '#000000';
      var btnTxtColor = sc.buttonTextColor || '#ffffff';
      var btnLabel = sc.buttonLabel || 'Share Cart';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'sharecart-open-btn-drawer';
      btn.className = 'sharecart-btn sharecart-drawer-btn';
      btn.setAttribute(INJECTED_ATTR, 'true');
      btn.style.cssText =
        'display:inline-flex;align-items:center;gap:8px;justify-content:center;' +
        'width:100%;padding:10px 24px;font-size:14px;font-weight:600;' +
        'border-radius:4px;cursor:pointer;border:none;' +
        'background:' + btnColor + ';color:' + btnTxtColor + ';margin-top:8px;transition:opacity 0.2s;';

      btn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
        '<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>' +
        '</svg>' +
        '<span class="sc-btn-label">' + btnLabel + '</span>';

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (sc.openShareModal) {
          sc.openShareModal();
        } else {
          console.warn('[ShareCart] openShareModal not available yet, dispatching custom event');
          document.dispatchEvent(new CustomEvent('sharecart:open'));
        }
      });

      return btn;
    }

    function injectButton(drawer) {
      // Don't inject twice
      if (drawer.querySelector('[' + INJECTED_ATTR + ']')) return;

      var btn = createShareButton();

      // Try to find the action/footer area to insert near
      var inserted = false;
      for (var i = 0; i < ACTION_SELECTORS.length; i++) {
        var target = drawer.querySelector(ACTION_SELECTORS[i]);
        if (target) {
          // Insert before checkout button or at top of footer
          if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.getAttribute('name') === 'checkout') {
            target.parentNode.insertBefore(btn, target);
          } else {
            // Insert at the beginning of the footer container
            target.insertBefore(btn, target.firstChild);
          }
          inserted = true;
          console.debug('[ShareCart] Drawer button injected near:', ACTION_SELECTORS[i]);
          break;
        }
      }

      // Fallback: append to the drawer itself
      if (!inserted) {
        drawer.appendChild(btn);
        console.debug('[ShareCart] Drawer button appended to drawer (fallback)');
      }
    }

    function tryInject() {
      var drawer = findCartDrawer();
      if (drawer) {
        injectButton(drawer);
      }
    }

    // ── Observe DOM for drawer appearing/changing ──
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];

        // Check if any added nodes are or contain a cart drawer
        if (mutation.addedNodes.length > 0) {
          tryInject();
        }

        // Check attribute changes (drawer open/close toggles)
        if (mutation.type === 'attributes') {
          var drawer = findCartDrawer();
          if (drawer && isDrawerVisible(drawer)) {
            injectButton(drawer);
          }
        }
      }
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'open', 'aria-hidden', 'hidden']
    });

    // Try immediate injection (drawer might already be in the DOM)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryInject);
    } else {
      tryInject();
    }

    console.debug('[ShareCart] Drawer observer started');
  } // end init()
})();
