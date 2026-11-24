// DoodleForth Google Cast Web Receiver bridge.
//
// Loaded before the unchanged TV Party Screen script (tv.js). A Cast receiver is
// served over HTTPS and cannot open the host's local ws:// socket, so the host
// app relays the same public spectator messages over a Cast message channel.
// This bridge stands in for WebSocket so tv.js renders exactly as it does in a
// TV browser. Platform-neutral: any sender (iOS today, Android later) that
// speaks this namespace can drive it.
(() => {
  'use strict';

  const NAMESPACE = 'urn:x-cast:com.doodleforth.tv';
  const ASSET_PATH = /^\/(avatars\/[a-f0-9]{24}\.png|join-qr\.png|tv-thumbnail\.png)(\?|$)/;
  const assets = new Map();   // path -> data URL
  const pendingAssets = new Set();
  const chunks = new Map();   // id -> { n, parts }
  let hostSender = null;      // Only the first sender (the host) drives the TV.
  let current = null;         // The CastSocket tv.js currently uses.
  let context = null;

  // TEMPORARY test diagnostics: a small status line in the corner of the TV.
  const diag = { sdk: !!(window.cast && cast.framework), started: false, ready: false, senders: 0, messages: 0, last: '', error: '' };
  function showDiag(update) {
    Object.assign(diag, update || {});
    let el = document.getElementById('castDiag');
    if (!el && document.body) {
      el = document.createElement('div');
      el.id = 'castDiag';
      el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;font:14px monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:6px;pointer-events:none';
      document.body.appendChild(el);
    }
    if (el) el.textContent = `cast sdk=${diag.sdk} started=${diag.started} ready=${diag.ready} senders=${diag.senders} msgs=${diag.messages} last=${diag.last}${diag.error ? ' err=' + diag.error : ''}`;
  }
  window.addEventListener('error', event => showDiag({ error: String(event.message).slice(0, 80) }));
  window.addEventListener('DOMContentLoaded', () => showDiag());

  function toHost(message) {
    if (!context || !hostSender) return;
    try { context.sendCustomMessage(NAMESPACE, hostSender, message); } catch (_) {}
  }

  // Minimal WebSocket stand-in used by tv.js.
  class CastSocket {
    constructor() {
      this.readyState = 1;
      this.onmessage = null;
      this.onclose = null;
      current = this;
      // Each new tv.js socket (first pair or a reconnect) asks for a fresh snapshot.
      setTimeout(() => toHost({ v: 1, type: 'resync' }), 0);
    }
    send() { /* The TV is read-only. */ }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      if (current === this) current = null;
      setTimeout(() => { if (this.onclose) this.onclose({ code: 1000 }); }, 0);
    }
  }
  window.WebSocket = CastSocket;

  function deliver(text) {
    let message;
    try { message = JSON.parse(text); } catch (_) { return; }
    if (message && message.cast_chunk) {
      const entry = chunks.get(message.cast_chunk) || { n: message.n, parts: [] };
      entry.parts[message.i] = message.d;
      chunks.set(message.cast_chunk, entry);
      if (entry.parts.filter(part => typeof part === 'string').length === entry.n) {
        chunks.delete(message.cast_chunk);
        deliver(entry.parts.join(''));
      }
      return;
    }
    if (!message || message.v !== 1) return;
    if (message.type === 'cast_hello') return;
    if (message.type === 'cast_asset') {
      if (typeof message.path === 'string' && /^data:image\/png;base64,/.test(message.data)) {
        assets.set(message.path, message.data);
        pendingAssets.delete(message.path);
        applyAssets(document);
      }
      return;
    }
    if (current && current.onmessage) current.onmessage({ data: JSON.stringify(message) });
  }

  // Images such as avatars and the join QR live on the host's local server.
  function resolveImage(image) {
    const src = image.getAttribute('src') || '';
    if (!src || src.startsWith('data:') || !ASSET_PATH.test(src)) return;
    const cached = assets.get(src);
    if (cached) { image.src = cached; return; }
    image.dataset.castPath = src;
    if (!pendingAssets.has(src)) {
      pendingAssets.add(src);
      toHost({ v: 1, type: 'asset_request', path: src });
    }
  }

  function applyAssets(root) {
    for (const image of root.querySelectorAll('img')) {
      const path = image.dataset.castPath;
      if (path && assets.has(path)) { image.src = assets.get(path); delete image.dataset.castPath; }
      else resolveImage(image);
    }
  }

  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target.tagName === 'IMG') resolveImage(record.target);
      for (const node of record.addedNodes || []) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'IMG') resolveImage(node);
        else applyAssets(node);
      }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });

  // Ask tv.js to pair immediately with a placeholder: the host app adds the real
  // pairing code locally, so the receiver never learns it.
  history.replaceState(null, '', location.pathname + location.search + '#pair=00000000&embedded=1');

  window.addEventListener('DOMContentLoaded', () => {
    const status = document.getElementById('pairStatus');
    if (status) status.textContent = 'Waiting for the DoodleForth host…';
  });

  const preview = new URLSearchParams(location.search).get('preview') === '1';
  if (preview || !window.cast || !cast.framework) {
    // Local preview/testing outside a Cast device: accept relayed text directly.
    window.doodleForthCastPreview = deliver;
    if (preview) window.addEventListener('message', event => { if (typeof event.data === 'string') deliver(event.data); });
    return;
  }
  context = cast.framework.CastReceiverContext.getInstance();
  context.addCustomMessageListener(NAMESPACE, event => {
    showDiag({ messages: diag.messages + 1, last: (String(event.data).match(/"type":"([a-z_]+)"/) || [, 'chunk'])[1] });
    if (!hostSender) hostSender = event.senderId;
    if (event.senderId !== hostSender) return; // Ignore other senders: they cannot take over the TV.
    deliver(typeof event.data === 'string' ? event.data : JSON.stringify(event.data));
  });
  context.addEventListener(cast.framework.system.EventType.READY, () => showDiag({ ready: true }));
  context.addEventListener(cast.framework.system.EventType.SENDER_CONNECTED, () => showDiag({ senders: context.getSenders().length }));
  context.addEventListener(cast.framework.system.EventType.SENDER_DISCONNECTED, event => {
    showDiag({ senders: context.getSenders().length });
    if (event.senderId !== hostSender) return;
    hostSender = null;
    // Keep the last picture; tv.js shows "Reconnecting…" via its own watchdog.
  });
  const options = new cast.framework.CastReceiverOptions();
  options.customNamespaces = { [NAMESPACE]: cast.framework.system.MessageType.STRING };
  options.disableIdleTimeout = true;
  options.skipPlayersLoad = true;
  try { context.start(options); showDiag({ started: true }); }
  catch (error) { showDiag({ error: 'start: ' + String(error && error.message || error).slice(0, 80) }); }
})();
