// ==UserScript==
// @name         Bridge: BOSS Zhipin
// @namespace    bridge-framework
// @version      2.0.0
// @description  BOSS直聘 Bridge 客户端 — 由 scripts/build-userscript.js 生成，请勿直接编辑
// @match        *://*.zhipin.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      127.0.0.1:*
// @connect      localhost
// @connect      localhost:*
// ==/UserScript==

// ═══════════════════════════════════════════════════════════
// Bridge Framework — BOSS 直聘脚本
// 通过 GM_xmlhttpRequest 绕过 Chrome PNA loopback 限制
// unsafeWindow 用于页面上下文的 eval 和 __bridge API
//
// ⚠️ 本文件是构建产物，勿手动修改。
//    __bridge API 定义唯一事实源：lib/shared/bridge-api.js
//    重新生成：node scripts/build-userscript.js
// ═══════════════════════════════════════════════════════════

(function() {
  'use strict';

  const CONFIG = {
    server: 'http://127.0.0.1:19425',
    site: 'zhipin.com',
    token: localStorage.getItem('boss_bridge_token') || '',
    reconnectDelay: 2000 + Math.floor(Math.random() * 1000),
  };

  let connected = false;
  let registered = false;
  let connId = null;           // 服务端返回的连接 ID，poll 时回传用于更新活跃时间
  let retryCount = 0;
  let pollFailCount = 0;
  let wsActive = false;   // WebSocket 是否活跃（优先于 HTTP 轮询）
  let wsSocket = null;
  let wsReconnectTimer = null;

  function gmFetch(url, opts) {
    var headers = Object.assign({}, opts && opts.headers);
    if (CONFIG.token) headers['Authorization'] = 'Bearer ' + CONFIG.token;
    return new Promise(function(resolve, reject) {
      GM_xmlhttpRequest(Object.assign({ url: url, timeout: 35000 }, opts, {
        headers: headers,
        onload: function(r) { resolve(r); },
        onerror: function(e) { reject(new Error('GM_xmlhttpRequest failed')); },
        ontimeout: function() { reject(new Error('GM_xmlhttpRequest timeout')); },
      }));
    });
  }

  async function connect() {
    // 优先尝试 WebSocket，失败再回退 HTTP 轮询
    connectWS();
    // HTTP 轮询作为兜底（WebSocket 连接成功后会暂停轮询）
    if (!registered) {
      setTimeout(function() {
        if (!wsActive) connectHTTP();
      }, 3000);
    }
  }

  // ── WebSocket 连接（优先路径）──
  function connectWS() {
    if (wsSocket) {
      try { wsSocket.close(); } catch(e) {}
      wsSocket = null;
    }
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }

    var wsUrl = CONFIG.server.replace(/^http/, 'ws');
    try {
      wsSocket = new WebSocket(wsUrl);
    } catch(e) {
      console.warn('[Bridge:BOSS] WebSocket 创建失败:', e.message);
      wsSocket = null;
      return;
    }

    wsSocket.onopen = function() {
      console.log('[Bridge:BOSS] WebSocket 已连接，发送 hello...');
      wsSocket.send(JSON.stringify({
        type: 'hello',
        site: CONFIG.site,
        url: location.href,
        title: document.title,
        userAgent: navigator.userAgent,
      }));
      wsActive = true;
      connected = true;
      registered = true;
      retryCount = 0;
      console.log('[Bridge:BOSS] WebSocket 活跃，HTTP 轮询已暂停');
    };

    wsSocket.onmessage = function(event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch(e) { return; }

      switch (msg.type) {
        case 'eval':
          handleEval(msg);
          break;
        case 'ping':
          try { wsSocket.send(JSON.stringify({ type: 'pong' })); } catch(e) {}
          break;
        case 'bye':
          console.warn('[Bridge:BOSS] 服务器发送 bye:', msg.reason || 'unknown');
          break;
        default:
          break;
      }
    };

    wsSocket.onclose = function(event) {
      console.warn('[Bridge:BOSS] WebSocket 断开 (code=' + event.code + '), 回退 HTTP 轮询');
      wsActive = false;
      wsSocket = null;
      connected = false;
      registered = false;
      var delay = CONFIG.reconnectDelay * (1 + Math.random());
      wsReconnectTimer = setTimeout(function() {
        console.log('[Bridge:BOSS] 尝试 WebSocket 重连...');
        connectWS();
      }, delay);
    };

    wsSocket.onerror = function(err) {
      console.warn('[Bridge:BOSS] WebSocket 错误，将回退 HTTP 轮询');
      wsActive = false;
      if (wsSocket) {
        try { wsSocket.close(); } catch(e) {}
        wsSocket = null;
      }
    };
  }

  // ── eval 处理（WebSocket 和 HTTP 轮询共用）──
  async function handleEval(msg) {
    try {
      var result = (0, unsafeWindow.eval)(msg.expression);
      if (msg.awaitPromise !== false) result = await Promise.resolve(result);
      var serialized = safeSerialize(result);
      var payload = { id: msg.id, value: serialized };
      if (wsActive && wsSocket && wsSocket.readyState === 1) {
        wsSocket.send(JSON.stringify(payload));
      } else {
        await gmFetch(CONFIG.server + '/api/result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(payload),
        });
      }
    } catch (e) {
      var errPayload = { id: msg.id, error: e.message || String(e) };
      if (wsActive && wsSocket && wsSocket.readyState === 1) {
        wsSocket.send(JSON.stringify({ type: 'result', id: msg.id, error: e.message || String(e) }));
      } else {
        await gmFetch(CONFIG.server + '/api/result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(errPayload),
        });
      }
    }
  }

  // ── HTTP 轮询连接（兜底路径）──
  async function connectHTTP() {
    if (!registered) {
      try {
        console.log('[Bridge:BOSS] Registering via GM_xmlhttpRequest...');
        var r = await gmFetch(CONFIG.server + '/api/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({
            site: CONFIG.site,
            url: location.href,
            title: document.title,
            userAgent: navigator.userAgent,
          }),
        });
        if (r.status === 200) {
          registered = true;
          connected = true;
          retryCount = 0;
          var data = JSON.parse(r.responseText);
          connId = data.id || null;
          console.log('[Bridge:BOSS] Registered with Bridge Server, id=' + (connId || '').slice(0, 8));
        } else {
          throw new Error('status ' + r.status);
        }
      } catch (err) {
        retryCount++;
        var baseDelay = CONFIG.reconnectDelay * Math.pow(2, retryCount - 1);
        var delay = Math.min(baseDelay * (0.75 + Math.random() * 0.5), 60000);
        console.warn('[Bridge:BOSS] Registration failed, retry in ' + Math.round(delay/1000) + 's:', err.message);
        setTimeout(connect, delay);
        return;
      }
    }
    poll();
  }

  async function poll() {
    if (wsActive) {
      setTimeout(poll, 5000);
      return;
    }
    if (!registered) return;
    try {
      var pollUrl = CONFIG.server + '/api/poll?site=' + CONFIG.site;
      if (connId) pollUrl += '&id=' + connId;
      var r = await gmFetch(pollUrl, { method: 'GET' });
      if (r.status !== 200) throw new Error('status ' + r.status);
      var msg = JSON.parse(r.responseText);

      if (msg.type === 'eval') {
        connected = true;
        pollFailCount = 0;
        await handleEval(msg);
        poll();
      } else {
        connected = true;
        pollFailCount = 0;
        poll();
      }
    } catch (err) {
      pollFailCount++;
      if (pollFailCount >= 3) {
        console.warn('[Bridge:BOSS] Poll failed repeatedly, reconnecting:', err.message);
        connected = false;
        registered = false;
        pollFailCount = 0;
        setTimeout(connect, CONFIG.reconnectDelay);
      } else {
        setTimeout(poll, 800 + Math.floor(Math.random() * 600));
      }
    }
  }

  function safeSerialize(value) {
    try {
      return JSON.parse(JSON.stringify(value === undefined ? null : value));
    } catch(e) { return null; }
  }

  // ── SPA 导航检测 ──
  var lastUrl = location.href;
  function checkUrlChange() {
    if (location.href !== lastUrl) lastUrl = location.href;
  }
  var _pushState = unsafeWindow.history.pushState;
  var _replaceState = unsafeWindow.history.replaceState;
  unsafeWindow.history.pushState = function() { _pushState.apply(this, arguments); checkUrlChange(); };
  unsafeWindow.history.replaceState = function() { _replaceState.apply(this, arguments); checkUrlChange(); };
  unsafeWindow.addEventListener('popstate', checkUrlChange);
  unsafeWindow.addEventListener('hashchange', checkUrlChange);

  // ═══════════════════════════════════════════════════════════
  // __bridge API 定义 — 唯一事实源 lib/shared/bridge-api.js
  // 由 scripts/build-userscript.js 注入（构建产物）
  // ═══════════════════════════════════════════════════════════
  var BRIDGE_CODE = __BRIDGE_API__;

  // 注入到页面上下文
  unsafeWindow.eval(BRIDGE_CODE);

  // ── 启动 ──
  connect();

  console.log('[Bridge:BOSS] Ready — connected to ' + CONFIG.server);
})();
