/* global shopify, document */

export function el(tag, props) {
    var node = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    if (props) {
        for (var key in props) {
            if (!props.hasOwnProperty(key)) continue;
            var val = props[key];
            if (val != null && val !== false) {
                node[key] = val;
            }
        }
    }
    appendChildren(node, children);
    return node;
}

export function appendChildren(node, list) {
    for (var i = 0; i < list.length; i++) {
        var child = list[i];
        if (child == null || child === false || child === true) continue;
        if (Array.isArray(child)) { appendChildren(node, child); continue; }
        if (typeof child === 'string' || typeof child === 'number') {
            node.appendChild(document.createTextNode(String(child)));
        } else {
            node.appendChild(child);
        }
    }
}

export function getStatus(cart) {
    if (!cart.isActive) return 'Paused';
    if (cart.expiresAt && new Date(cart.expiresAt) < new Date()) return 'Expired';
    return 'Active';
}

export function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

export function formatPrice(cents) {
    if (cents == null) return '';
    return '$' + (cents / 100).toFixed(2);
}

export function resolveSessionToken(args) {
    var token = (typeof shopify !== 'undefined' && shopify.sessionToken)
        ? shopify.sessionToken
        : null;

    if (!token) {
        for (var i = 0; i < args.length; i++) {
            var arg = args[i];
            if (arg && typeof arg === 'object' && arg.sessionToken) {
                token = arg.sessionToken;
                break;
            }
        }
    }
    return token;
}

var _appUrl = '';
try { _appUrl = (process.env.SHOPIFY_APP_URL || '').replace(/\/+$/, ''); } catch (e) { }

export function getAppUrlSync() {
    return _appUrl;
}

var _bootstrapAttempted = false;

export async function ensureAppUrl() {
    if (_appUrl) return _appUrl;
    if (_bootstrapAttempted) return _appUrl;
    _bootstrapAttempted = true;

    try {
        if (typeof shopify === 'undefined' || typeof shopify.query !== 'function') return _appUrl;
        var result = await shopify.query(
            '{shop{metafield(namespace:"sharecart",key:"api_url"){value}}}'
        );
        var val = result &&
            result.data &&
            result.data.shop &&
            result.data.shop.metafield &&
            result.data.shop.metafield.value;
        if (val) _appUrl = val.replace(/\/+$/, '');
    } catch (_) { }
    return _appUrl;
}

export async function apiFetch(path, method, sessionToken) {
    if (!sessionToken) throw new Error('No session token API available');
    var token = await sessionToken.get();

    var appUrl = await ensureAppUrl();
    if (!appUrl) throw new Error('Could not determine API URL');

    var url = appUrl + path;
    var res = await fetch(url, {
        method: method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
        },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
}
