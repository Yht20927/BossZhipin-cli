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
  var BRIDGE_CODE = "(function() {\n  \"use strict\";\n  var BASE = \"https://www.zhipin.com\";\n  var _token = null;   // CSRF token（getUserInfo 后自动更新）\n  var _abc = null;     // security iframe 中的 ABC 加密类\n\n  // ── 请求基础 ──\n  function headers(method, formBody) {\n    var h = { 'x-requested-with': 'XMLHttpRequest' };\n    if (method === 'POST' && formBody) h['content-type'] = 'application/x-www-form-urlencoded';\n    if (_token) h['token'] = _token;\n    return h;\n  }\n  function buildQuery(params) {\n    if (!params) return '';\n    var parts = [];\n    for (var k in params) {\n      if (!params.hasOwnProperty(k)) continue;\n      var v = params[k];\n      if (v === undefined || v === null) continue;\n      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));\n    }\n    return parts.length > 0 ? '?' + parts.join('&') : '';\n  }\n  function buildFormBody(params) {\n    if (!params) return undefined;\n    var parts = [];\n    for (var k in params) {\n      if (!params.hasOwnProperty(k)) continue;\n      var v = params[k];\n      if (v === undefined || v === null) continue;\n      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));\n    }\n    return parts.length > 0 ? parts.join('&') : undefined;\n  }\n  // 统一请求：GET 用 query string，POST 用 form-urlencoded body\n  async function call(method, path, params) {\n    var url = BASE + path + (method === 'GET' ? buildQuery(params) : '');\n    var body = method === 'POST' ? buildFormBody(params) : undefined;\n    var opts = { method: method, credentials: 'include', headers: headers(method, body) };\n    if (body) opts.body = body;\n    var res = await fetch(url, opts);\n    return await res.json();\n  }\n\n  // ── 身份/token ──\n  async function ensureToken() {\n    if (_token) return _token;\n    var d = await call('GET', '/wapi/zpuser/wap/getUserInfo.json');\n    if (d && d.code === 0 && d.zpData && d.zpData.token) _token = d.zpData.token;\n    return _token;\n  }\n\n  // ABC 类暴露（security iframe）\n  function exposeAbc() {\n    if (_abc) return true;\n    try {\n      for (var i = 0; i < window.frames.length; i++) {\n        try {\n          var fw = window.frames[i];\n          if (fw && fw.ABC && typeof fw.ABC === 'function') { _abc = fw.ABC; return true; }\n        } catch (e) {}\n      }\n    } catch (e) {}\n    return false;\n  }\n\n  // ── 公共 Bridge API ──\n  window.__bridge = {\n    // 用户\n    getUserInfo: async function() {\n      var d = await call('GET', '/wapi/zpuser/wap/getUserInfo.json');\n      if (d && d.code === 0 && d.zpData && d.zpData.token) _token = d.zpData.token;\n      return d;\n    },\n\n    // 搜索职位\n    search: function(p) {\n      p = Object.assign({\n        page: 1, pageSize: 15, city: '100010000', query: '',\n        expectInfo: '', multiSubway: '', multiBusinessDistrict: '',\n        position: '', jobType: '', salary: '', experience: '',\n        degree: '', industry: '', scale: '', stage: '', scene: 1,\n        encryptExpectId: ''\n      }, p || {});\n      return call('POST', '/wapi/zpgeek/search/joblist.json', p);\n    },\n\n    // 职位详情\n    jobDetail: function(securityId, lid) {\n      return call('GET', '/wapi/zpgeek/job/detail.json', { securityId: securityId, lid: lid || '' });\n    },\n\n    // 推荐职位\n    recommendJobs: function(p) {\n      p = Object.assign({ page: 1, pageSize: 15, city: '100010000', encryptExpectId: '' }, p || {});\n      return call('GET', '/wapi/zpgeek/pc/recommend/job/list.json', p);\n    },\n\n    // 过滤条件 / 城市 / 行业 / header 等数据\n    filterConditions: function() { return call('GET', '/wapi/zpgeek/pc/all/filter/conditions.json'); },\n    citySite: function() { return call('GET', '/wapi/zpgeek/common/data/city/site.json'); },\n    cityData: function() { return call('GET', '/wapi/zpCommon/data/city.json'); },\n    industryData: function() { return call('GET', '/wapi/zpCommon/data/industry.json'); },\n    headerData: function() { return call('GET', '/wapi/zpgeek/common/data/header.json'); },\n\n    // ── 打招呼 / 沟通 ──\n    addFriend: function(sid, jid, lid) {\n      var url = BASE + '/wapi/zpgeek/friend/add.json' + buildQuery({ securityId: sid, jobId: jid, lid: lid || '' });\n      return fetch(url, { method: 'POST', credentials: 'include', headers: headers('POST', false) })\n        .then(function(r) { return r.json(); });\n    },\n\n    // ── 聊天：会话列表（求职者端）──\n    chatList: function(page) {\n      return call('GET', '/wapi/zpgeek/friend/getGeekFriendListV2.json', { page: page || 1, status: 0 });\n    },\n\n    // ── 聊天：收到的招呼列表（收件箱）──\n    newGreets: function(page) {\n      return call('GET', '/wapi/zpgeek/friend/getGeekNewGreetList.json', { page: page || 1 });\n    },\n\n    // ── 聊天：历史消息（求职者端）──\n    // bossId=HR 的 uid（chatList 返回的 uid 字段），securityId=HR 的 securityId\n    chatHistory: function(bossId, securityId, page, count) {\n      return call('GET', '/wapi/zpchat/geek/historyMsg', {\n        bossId: bossId, securityId: securityId || '', page: page || 1, c: count || 20, src: 0\n      });\n    },\n\n    // ── 聊天：旧版接口（向后兼容）──\n    friendList: function() { return call('POST', '/wapi/zprelation/friend/getGeekFriendList.json', {}); },\n    friendListByLabel: function(labelId, encryptSystemId) {\n      return call('GET', '/wapi/zprelation/friend/geekFilterByLabel', { labelId: labelId || 0, encryptSystemId: encryptSystemId || '' });\n    },\n    msgHistory: function(type, lastId, secretId) {\n      return call('GET', '/wapi/zpmsg/history/pull', { type: type || 0, lastId: lastId || '', secretId: secretId || '' });\n    },\n    chatWsConfig: function() { return call('GET', '/wapi/zpchat/config/ws'); },\n    chatConfig: function() { return call('GET', '/wapi/zpchat/config/get'); },\n\n    // ── 聊天：发送消息（MQTT，走 UI 自动化）──\n    // 必须在聊天页 /web/geek/chat 执行；不在则返回 needNavigate 由 CLI 层导航后重试。\n    sendChatMessage: async function(uid, text) {\n      if (location.pathname.indexOf('/web/geek/chat') === -1) {\n        return { ok: false, notOnChatPage: true, needNavigate: '/web/geek/chat' };\n      }\n      // 1. 在会话列表中找到对应对话并点击\n      var items = document.querySelectorAll('.chat-list-item, .friend-item, .friend-content, [data-uid]');\n      var clicked = false;\n      for (var i = 0; i < items.length; i++) {\n        var el = items[i];\n        var u = el.getAttribute('data-uid') || (el.dataset && el.dataset.uid) || '';\n        if (u && String(u) === String(uid)) { el.click(); clicked = true; break; }\n      }\n      if (!clicked) return { ok: false, error: 'conversation_not_found', uid: uid };\n      await new Promise(function(r) { setTimeout(r, 1500); }); // 等待会话加载\n\n      // 2. 找到输入框并输入\n      var editor = null;\n      var editorSels = ['.chat-editor [contenteditable=\"true\"]', '.chat-input [contenteditable=\"true\"]',\n        '.message-editor [contenteditable=\"true\"]', '[contenteditable=\"true\"]', 'textarea'];\n      for (var j = 0; j < editorSels.length; j++) {\n        var cand = document.querySelector(editorSels[j]);\n        if (cand && cand.offsetParent !== null) { editor = cand; break; }\n      }\n      if (!editor) return { ok: false, error: 'editor_not_found' };\n      editor.focus();\n      if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {\n        editor.value = text;\n      } else {\n        editor.textContent = '';\n        document.execCommand('insertText', false, text);\n      }\n      editor.dispatchEvent(new Event('input', { bubbles: true }));\n      await new Promise(function(r) { setTimeout(r, 300); });\n\n      // 3. 点击发送按钮；找不到则模拟 Enter\n      var btn = document.querySelector('.conversation-editor .submit, .submit-content .submit, .conversation-operate .submit');\n      if (btn) { btn.click(); }\n      else {\n        var evt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });\n        editor.dispatchEvent(evt);\n      }\n      return { ok: true, uid: uid };\n    },\n\n    // ── 聊天：导航到聊天页（页面会跳转，调用方需等待重连）──\n    navigateToChat: function() {\n      setTimeout(function() { location.href = BASE + '/web/geek/chat'; }, 300);\n      return { ok: true, action: 'navigate', to: '/web/geek/chat' };\n    },\n\n    // ── 聊天：交换联系方式（type=1 手机号 / 2 微信）──\n    exchangeRequest: function(securityId, uniqueId, name, type) {\n      return call('POST', '/wapi/zpchat/exchange/request', {\n        type: String(type || 1), securityId: securityId, uniqueId: String(uniqueId), name: name || ''\n      });\n    },\n\n    // ── 简历（求职者端）──\n    resumeBaseinfo: function() { return call('GET', '/wapi/zpgeek/resume/baseinfo/query.json'); },\n    resumeExpect: function() { return call('GET', '/wapi/zpgeek/resume/expect/query.json'); },\n    resumeStatus: function() { return call('GET', '/wapi/zpgeek/resume/status.json'); },\n    resumeStep: function() { return call('GET', '/wapi/zpgeek/resume/complete/step.json', { version: 2 }); },\n\n    // ── 投递记录（求职者端）──\n    deliverList: function(page) {\n      return call('GET', '/wapi/zpgeek/resume/deliver/list.json', { page: page || 1, pageSize: 20 });\n    },\n\n    // ── 期望职位 / 简历限制 ──\n    expectList: function() { return call('GET', '/wapi/zpgeek/pc/recommend/expect/list.json'); },\n    resumeRestrictList: function() { return call('GET', '/wapi/zpgeek/resume/restrict/list.json'); },\n\n    // ── Token 生成（__zp_stoken__）──\n    exposeAbc: exposeAbc,\n    hasAbc: function() { return !!_abc || exposeAbc(); },\n    genStoken: function(seed, ts) {\n      if (!exposeAbc()) throw new Error('ABC not found — security iframe may not be loaded');\n      var correctedTs = parseInt(ts) + 60 * (480 + new Date().getTimezoneOffset()) * 1000;\n      var token = (new _abc()).z(seed, correctedTs);\n      return { token: token, tokenEncoded: encodeURIComponent(token), tsUsed: correctedTs };\n    },\n    getPassportConfig: function() {\n      try { var raw = localStorage.getItem('passport_config'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }\n    },\n\n    // ── 会话刷新（修复 code:37 / token 过期）──\n    refreshSession: function() {\n      setTimeout(function() { location.href = BASE + '/web/geek/jobs'; }, 300);\n      return { ok: true, action: 'navigate', to: '/web/geek/jobs' };\n    },\n\n    // ── 工具 ──\n    ensureToken: ensureToken,\n    token: function() { return _token; }\n  };\n\n  // 自动预热 token\n  ensureToken().then(function(t) {\n    console.log('[Bridge:BOSS] Token cached:', t ? 'yes' : 'no');\n  });\n\n  console.log('[Bridge:BOSS] __bridge API ready (bridge-api.js)');\n})()";

  // 注入到页面上下文
  unsafeWindow.eval(BRIDGE_CODE);

  // ── 启动 ──
  connect();

  console.log('[Bridge:BOSS] Ready — connected to ' + CONFIG.server);
})();
