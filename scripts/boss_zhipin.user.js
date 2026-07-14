// ==UserScript==
// @name         Bridge: BOSS Zhipin
// @namespace    bridge-framework
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
// ═══════════════════════════════════════════════════════════

(function() {
  'use strict';

  const CONFIG = {
    server: 'http://127.0.0.1:19425',
    site: 'zhipin.com',
    token: localStorage.getItem('boss_bridge_token') || '6831ace8fd9094effe45913acef94988eb1224700460ef3f',
    reconnectDelay: 2000 + Math.floor(Math.random() * 1000),
  };

  let connected = false;
  let registered = false;
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
      // 发送 hello 握手
      wsSocket.send(JSON.stringify({
        type: 'hello',
        site: CONFIG.site,
        url: location.href,
        title: document.title,
        userAgent: navigator.userAgent,
      }));
      // WebSocket 连接成功即标记活跃，暂停 HTTP 轮询避免冲突
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
          // 执行表达式并返回结果
          handleEval(msg);
          break;

        case 'ping':
          // 心跳响应
          try {
            wsSocket.send(JSON.stringify({ type: 'pong' }));
          } catch(e) {}
          break;

        case 'bye':
          console.warn('[Bridge:BOSS] 服务器发送 bye:', msg.reason || 'unknown');
          break;

        default:
          // ignore unknown messages
          break;
      }
    };

    wsSocket.onclose = function(event) {
      console.warn('[Bridge:BOSS] WebSocket 断开 (code=' + event.code + '), 回退 HTTP 轮询');
      wsActive = false;
      wsSocket = null;
      connected = false;
      registered = false;
      // 延迟重连
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
      var payload = { id: msg.id, value: safeSerialize(result) };
      if (wsActive && wsSocket && wsSocket.readyState === 1) {
        wsSocket.send(JSON.stringify({ type: 'result', id: msg.id, value: safeSerialize(result) }));
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
          console.log('[Bridge:BOSS] Registered with Bridge Server');
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
    // WebSocket 活跃时暂停 HTTP 轮询
    if (wsActive) {
      setTimeout(poll, 5000); // 每 5s 检查一次 WS 状态
      return;
    }
    if (!registered) return;
    try {
      var r = await gmFetch(CONFIG.server + '/api/poll?site=' + CONFIG.site, { method: 'GET' });
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
  // BOSS 直聘 Bridge API — 注入页面上下文
  // 使用页面原生 fetch，所有 cookie/token 自动带上
  // ═══════════════════════════════════════════════════════════

  var BRIDGE_CODE = (function(){/*
(function() {
  "use strict";
  var BASE = "https://www.zhipin.com";

  // 缓存 CSRF token（getUserInfo 后自动更新）
  var _token = null;

  function token() {
    return _token;
  }

  // 通用 header：content-type + x-requested-with（触发浏览器自动加 cookie）
  function headers(method, formBody) {
    var h = { 'x-requested-with': 'XMLHttpRequest' };
    if (method === 'POST' && formBody) {
      h['content-type'] = 'application/x-www-form-urlencoded';
    }
    // CSRF token（登录后有效）
    if (_token) h['token'] = _token;
    return h;
  }

  function buildQuery(params) {
    if (!params) return '';
    var parts = [];
    for (var k in params) {
      if (!params.hasOwnProperty(k)) continue;
      var v = params[k];
      if (v === undefined || v === null) continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
    return parts.length > 0 ? '?' + parts.join('&') : '';
  }

  function buildFormBody(params) {
    if (!params) return undefined;
    var parts = [];
    for (var k in params) {
      if (!params.hasOwnProperty(k)) continue;
      var v = params[k];
      if (v === undefined || v === null) continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
    return parts.length > 0 ? parts.join('&') : undefined;
  }

  function buildUrl(path, query) {
    return BASE + path + buildQuery(query);
  }

  // 把 err 完整序列化方便 CLI 诊断
  function dumpErr(err) {
    var d = { message: (err && err.message) || String(err) };
    if (err && typeof err === "object") {
      try {
        for (var k in err) {
          if (k === "name" || k === "stack") continue;
          try { d[k] = err[k]; } catch(e) {}
        }
      } catch(e) {}
      if (err.stack) d.stack = String(err.stack).split("\n").slice(0, 4).join(" | ");
    }
    return d;
  }

  // 统一请求：GET 用 query string，POST 用 form-urlencoded body
  async function call(method, path, params) {
    var url = buildUrl(path, method === 'GET' ? params : null);
    var body = method === 'POST' ? buildFormBody(params) : undefined;
    var opts = { method: method, credentials: 'include', headers: headers(method, body) };
    if (body) opts.body = body;

    var res = await fetch(url, opts);
    var data = await res.json();
    return data;
  }

  // 获取用户信息并缓存 CSRF token
  async function ensureToken() {
    if (_token) return _token;
    var data = await call('GET', '/wapi/zpuser/wap/getUserInfo.json');
    if (data && data.code === 0 && data.zpData) {
      _token = data.zpData.token || null;
    }
    return _token;
  }

  // ── Bridge API ──

  window.__bridge = {
    // 用户
    getUserInfo: async function() {
      var data = await call('GET', '/wapi/zpuser/wap/getUserInfo.json');
      if (data && data.code === 0 && data.zpData && data.zpData.token) {
        _token = data.zpData.token;
      }
      return data;
    },

    // 搜索职位
    // params: { query, city, page, pageSize, experience, degree, salary, industry, scale, jobType, expectInfo }
    search: function(params) {
      var p = Object.assign({
        page: 1, pageSize: 15, city: '100010000', query: '',
        expectInfo: '', multiSubway: '', multiBusinessDistrict: '',
        position: '', jobType: '', salary: '', experience: '',
        degree: '', industry: '', scale: '', stage: '', scene: 1,
        encryptExpectId: ''
      }, params || {});
      return call('POST', '/wapi/zpgeek/search/joblist.json', p);
    },

    // 职位详情
    jobDetail: function(securityId, lid) {
      return call('GET', '/wapi/zpgeek/job/detail.json', {
        securityId: securityId, lid: lid || ''
      });
    },

    // 推荐职位列表
    recommendJobs: function(params) {
      var p = Object.assign({
        page: 1, pageSize: 15, city: '100010000',
        expectInfo: '', jobType: '', salary: '', experience: '',
        degree: '', industry: '', scale: '', encryptExpectId: ''
      }, params || {});
      return call('GET', '/wapi/zpgeek/pc/recommend/job/list.json', p);
    },

    // 搜索过滤条件
    filterConditions: function() {
      return call('GET', '/wapi/zpgeek/pc/all/filter/conditions.json');
    },

    // 城市数据
    cityData: function() {
      return call('GET', '/wapi/zpCommon/data/city.json');
    },

    // 城市站点信息
    citySite: function() {
      return call('GET', '/wapi/zpgeek/common/data/city/site.json');
    },

    // ── 消息/聊天 ──

    // 好友列表
    friendList: function(encryptSystemId) {
      return call('POST', '/wapi/zprelation/friend/getGeekFriendList.json', {});
    },

    // 好友列表（按标签过滤）
    friendListByLabel: function(labelId, encryptSystemId) {
      return call('GET', '/wapi/zprelation/friend/geekFilterByLabel', {
        labelId: labelId || 0,
        encryptSystemId: encryptSystemId || ''
      });
    },

    // 拉取消息历史
    msgHistory: function(type, lastId, secretId) {
      return call('GET', '/wapi/zpmsg/history/pull', {
        type: type || 0,
        lastId: lastId || '',
        secretId: secretId || ''
      });
    },

    // 聊天 WebSocket 配置
    chatWsConfig: function() {
      return call('GET', '/wapi/zpchat/config/ws');
    },

    // 聊天配置
    chatConfig: function() {
      return call('GET', '/wapi/zpchat/config/get');
    },

    // ── 简历相关 ──

    // 简历完成度
    resumeStep: function() {
      return call('GET', '/wapi/zpgeek/resume/complete/step.json', { version: 2 });
    },

    // 期望职位列表
    expectList: function() {
      return call('GET', '/wapi/zpgeek/pc/recommend/expect/list.json');
    },

    // ── 通用数据 ──

    // 行业数据
    industryData: function() {
      return call('GET', '/wapi/zpCommon/data/industry.json');
    },

    // header 数据
    headerData: function() {
      return call('GET', '/wapi/zpgeek/common/data/header.json');
    },

    // 简历限制列表
    resumeRestrictList: function() {
      return call('GET', '/wapi/zpgeek/resume/restrict/list.json');
    },

    // ── 打招呼 / 沟通 ──
    addFriend: function(sid, jid, lid) {
      var url = BASE + '/wapi/zpgeek/friend/add.json' + buildQuery({ securityId: sid, jobId: jid, lid: lid || '' });
      return fetch(url, { method: 'POST', credentials: 'include', headers: headers('POST', false) })
        .then(function(r) { return r.json(); });
    },

    // ── Token 生成（__zp_stoken__）──
    // 暴露 security iframe 中的 ABC 加密类
    exposeAbc: function() {
      if (window.__BOSS_ABC__) return true;
      try {
        for (var i = 0; i < window.frames.length; i++) {
          try {
            var fw = window.frames[i];
            if (fw && fw.ABC && typeof fw.ABC === 'function') {
              window.__BOSS_ABC__ = fw.ABC;
              return true;
            }
          } catch(e) {}
        }
      } catch(e) {}
      return false;
    },

    hasAbc: function() {
      return !!window.__BOSS_ABC__ || this.exposeAbc();
    },

    genStoken: function(seed, ts) {
      if (!this.exposeAbc()) throw new Error('ABC not found — security iframe may not be loaded');
      var correctedTs = parseInt(ts) + 60 * (480 + new Date().getTimezoneOffset()) * 1000;
      var token = (new window.__BOSS_ABC__()).z(seed, correctedTs);
      return { token: token, tokenEncoded: encodeURIComponent(token), tsUsed: correctedTs };
    },

    getPassportConfig: function() {
      try {
        var raw = localStorage.getItem('passport_config');
        return raw ? JSON.parse(raw) : null;
      } catch(e) { return null; }
    },

    // ── 工具 ──
    ensureToken: ensureToken,
    token: token,
  };

  // 自动预热 token
  ensureToken().then(function(t) {
    console.log('[Bridge:BOSS] Token cached:', t ? 'yes' : 'no');
  });

  console.log('[Bridge:BOSS] __bridge API ready (v1: fetch-based, auto-cookie)');
})();
*/}).toString().match(/\/\*([\s\S]*)\*\//)[1];

  // 注入到页面上下文
  unsafeWindow.eval(BRIDGE_CODE);

  // ── 启动轮询 ──
  connect();

  console.log('[Bridge:BOSS] Ready — connected to ' + CONFIG.server);
})();
