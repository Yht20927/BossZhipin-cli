// lib/shared/bridge-api.js — BOSS 直聘 Bridge API 唯一事实源
//
// 定义页面上下文里的 window.__bridge（浏览器原生 fetch，自动携带登录态）。
// 该定义是"单一事实源"，被以下两处引用，改这里即可同步：
//   1. 油猴脚本 scripts/boss_zhipin.user.js（由 scripts/build-userscript.js 从本文件生成）
//   2. Bridge Server 自愈注入 lib/shared/bootstrap.js（__bridge 丢失时 prepend 到 eval）
//
// 逆向来源（GitHub 公开成果，已验证字段结构）：
//   - tianhhe/boss-zhipin-cli  求职者端（geek）完整实现
//   - jackwener/OpenCLI        BOSS CLI（含 UI 发送消息）
//   - Jirentian/BossZhipin_reverse  RPC 方案 + 历史消息
//
// 关键结论：BOSS 聊天发送走 MQTT（非 HTTP），sendChatMessage 采用 UI 自动化
// （点击会话 → 输入 → 发送）；读操作（列表/历史/简历/投递记录）走 HTTP API。

const BRIDGE_API = `(function() {
  "use strict";
  var BASE = "https://www.zhipin.com";
  var _token = null;   // CSRF token（getUserInfo 后自动更新）
  var _abc = null;     // security iframe 中的 ABC 加密类

  // ── 请求基础 ──
  function headers(method, formBody) {
    var h = { 'x-requested-with': 'XMLHttpRequest' };
    if (method === 'POST' && formBody) h['content-type'] = 'application/x-www-form-urlencoded';
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
  // 统一请求：GET 用 query string，POST 用 form-urlencoded body
  async function call(method, path, params) {
    var url = BASE + path + (method === 'GET' ? buildQuery(params) : '');
    var body = method === 'POST' ? buildFormBody(params) : undefined;
    var opts = { method: method, credentials: 'include', headers: headers(method, body) };
    if (body) opts.body = body;
    var res = await fetch(url, opts);
    return await res.json();
  }

  // ── 身份/token ──
  async function ensureToken() {
    if (_token) return _token;
    var d = await call('GET', '/wapi/zpuser/wap/getUserInfo.json');
    if (d && d.code === 0 && d.zpData && d.zpData.token) _token = d.zpData.token;
    return _token;
  }

  // ABC 类暴露（security iframe）
  function exposeAbc() {
    if (_abc) return true;
    try {
      for (var i = 0; i < window.frames.length; i++) {
        try {
          var fw = window.frames[i];
          if (fw && fw.ABC && typeof fw.ABC === 'function') { _abc = fw.ABC; return true; }
        } catch (e) {}
      }
    } catch (e) {}
    return false;
  }

  // ── 公共 Bridge API ──
  window.__bridge = {
    // 用户
    getUserInfo: async function() {
      var d = await call('GET', '/wapi/zpuser/wap/getUserInfo.json');
      if (d && d.code === 0 && d.zpData && d.zpData.token) _token = d.zpData.token;
      return d;
    },

    // 搜索职位
    search: function(p) {
      p = Object.assign({
        page: 1, pageSize: 15, city: '100010000', query: '',
        expectInfo: '', multiSubway: '', multiBusinessDistrict: '',
        position: '', jobType: '', salary: '', experience: '',
        degree: '', industry: '', scale: '', stage: '', scene: 1,
        encryptExpectId: ''
      }, p || {});
      return call('POST', '/wapi/zpgeek/search/joblist.json', p);
    },

    // 职位详情
    jobDetail: function(securityId, lid) {
      return call('GET', '/wapi/zpgeek/job/detail.json', { securityId: securityId, lid: lid || '' });
    },

    // 推荐职位
    recommendJobs: function(p) {
      p = Object.assign({ page: 1, pageSize: 15, city: '100010000', encryptExpectId: '' }, p || {});
      return call('GET', '/wapi/zpgeek/pc/recommend/job/list.json', p);
    },

    // 过滤条件 / 城市 / 行业 / header 等数据
    filterConditions: function() { return call('GET', '/wapi/zpgeek/pc/all/filter/conditions.json'); },
    citySite: function() { return call('GET', '/wapi/zpgeek/common/data/city/site.json'); },
    cityData: function() { return call('GET', '/wapi/zpCommon/data/city.json'); },
    industryData: function() { return call('GET', '/wapi/zpCommon/data/industry.json'); },
    headerData: function() { return call('GET', '/wapi/zpgeek/common/data/header.json'); },

    // ── 打招呼 / 沟通 ──
    addFriend: function(sid, jid, lid) {
      var url = BASE + '/wapi/zpgeek/friend/add.json' + buildQuery({ securityId: sid, jobId: jid, lid: lid || '' });
      return fetch(url, { method: 'POST', credentials: 'include', headers: headers('POST', false) })
        .then(function(r) { return r.json(); });
    },

    // ── 聊天：会话列表（求职者端）──
    chatList: function(page) {
      return call('GET', '/wapi/zpgeek/friend/getGeekFriendListV2.json', { page: page || 1, status: 0 });
    },

    // ── 聊天：收到的招呼列表（收件箱）──
    newGreets: function(page) {
      return call('GET', '/wapi/zpgeek/friend/getGeekNewGreetList.json', { page: page || 1 });
    },

    // ── 聊天：历史消息（求职者端）──
    // bossId=HR 的 uid（chatList 返回的 uid 字段），securityId=HR 的 securityId
    chatHistory: function(bossId, securityId, page, count) {
      return call('GET', '/wapi/zpchat/geek/historyMsg', {
        bossId: bossId, securityId: securityId || '', page: page || 1, c: count || 20, src: 0
      });
    },

    // ── 聊天：旧版接口（向后兼容）──
    friendList: function() { return call('POST', '/wapi/zprelation/friend/getGeekFriendList.json', {}); },
    friendListByLabel: function(labelId, encryptSystemId) {
      return call('GET', '/wapi/zprelation/friend/geekFilterByLabel', { labelId: labelId || 0, encryptSystemId: encryptSystemId || '' });
    },
    msgHistory: function(type, lastId, secretId) {
      return call('GET', '/wapi/zpmsg/history/pull', { type: type || 0, lastId: lastId || '', secretId: secretId || '' });
    },
    chatWsConfig: function() { return call('GET', '/wapi/zpchat/config/ws'); },
    chatConfig: function() { return call('GET', '/wapi/zpchat/config/get'); },

    // ── 聊天：发送消息（MQTT，走 UI 自动化）──
    // 必须在聊天页 /web/geek/chat 执行；不在则返回 needNavigate 由 CLI 层导航后重试。
    sendChatMessage: async function(uid, text) {
      if (location.pathname.indexOf('/web/geek/chat') === -1) {
        return { ok: false, notOnChatPage: true, needNavigate: '/web/geek/chat' };
      }
      // 1. 在会话列表中找到对应对话并点击
      var items = document.querySelectorAll('.chat-list-item, .friend-item, .friend-content, [data-uid]');
      var clicked = false;
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        var u = el.getAttribute('data-uid') || (el.dataset && el.dataset.uid) || '';
        if (u && String(u) === String(uid)) { el.click(); clicked = true; break; }
      }
      if (!clicked) return { ok: false, error: 'conversation_not_found', uid: uid };
      await new Promise(function(r) { setTimeout(r, 1500); }); // 等待会话加载

      // 2. 找到输入框并输入
      var editor = null;
      var editorSels = ['.chat-editor [contenteditable="true"]', '.chat-input [contenteditable="true"]',
        '.message-editor [contenteditable="true"]', '[contenteditable="true"]', 'textarea'];
      for (var j = 0; j < editorSels.length; j++) {
        var cand = document.querySelector(editorSels[j]);
        if (cand && cand.offsetParent !== null) { editor = cand; break; }
      }
      if (!editor) return { ok: false, error: 'editor_not_found' };
      editor.focus();
      if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
        editor.value = text;
      } else {
        editor.textContent = '';
        document.execCommand('insertText', false, text);
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(function(r) { setTimeout(r, 300); });

      // 3. 点击发送按钮；找不到则模拟 Enter
      var btn = document.querySelector('.conversation-editor .submit, .submit-content .submit, .conversation-operate .submit');
      if (btn) { btn.click(); }
      else {
        var evt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
        editor.dispatchEvent(evt);
      }
      return { ok: true, uid: uid };
    },

    // ── 聊天：导航到聊天页（页面会跳转，调用方需等待重连）──
    navigateToChat: function() {
      setTimeout(function() { location.href = BASE + '/web/geek/chat'; }, 300);
      return { ok: true, action: 'navigate', to: '/web/geek/chat' };
    },

    // ── 聊天：交换联系方式（type=1 手机号 / 2 微信）──
    exchangeRequest: function(securityId, uniqueId, name, type) {
      return call('POST', '/wapi/zpchat/exchange/request', {
        type: String(type || 1), securityId: securityId, uniqueId: String(uniqueId), name: name || ''
      });
    },

    // ── 简历（求职者端）──
    resumeBaseinfo: function() { return call('GET', '/wapi/zpgeek/resume/baseinfo/query.json'); },
    resumeExpect: function() { return call('GET', '/wapi/zpgeek/resume/expect/query.json'); },
    resumeStatus: function() { return call('GET', '/wapi/zpgeek/resume/status.json'); },
    resumeStep: function() { return call('GET', '/wapi/zpgeek/resume/complete/step.json', { version: 2 }); },

    // ── 投递记录（求职者端）──
    deliverList: function(page) {
      return call('GET', '/wapi/zpgeek/resume/deliver/list.json', { page: page || 1, pageSize: 20 });
    },

    // ── 期望职位 / 简历限制 ──
    expectList: function() { return call('GET', '/wapi/zpgeek/pc/recommend/expect/list.json'); },
    resumeRestrictList: function() { return call('GET', '/wapi/zpgeek/resume/restrict/list.json'); },

    // ── Token 生成（__zp_stoken__）──
    exposeAbc: exposeAbc,
    hasAbc: function() { return !!_abc || exposeAbc(); },
    genStoken: function(seed, ts) {
      if (!exposeAbc()) throw new Error('ABC not found — security iframe may not be loaded');
      var correctedTs = parseInt(ts) + 60 * (480 + new Date().getTimezoneOffset()) * 1000;
      var token = (new _abc()).z(seed, correctedTs);
      return { token: token, tokenEncoded: encodeURIComponent(token), tsUsed: correctedTs };
    },
    getPassportConfig: function() {
      try { var raw = localStorage.getItem('passport_config'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },

    // ── 会话刷新（修复 code:37 / token 过期）──
    refreshSession: function() {
      setTimeout(function() { location.href = BASE + '/web/geek/jobs'; }, 300);
      return { ok: true, action: 'navigate', to: '/web/geek/jobs' };
    },

    // ── 工具 ──
    ensureToken: ensureToken,
    token: function() { return _token; }
  };

  // 自动预热 token
  ensureToken().then(function(t) {
    console.log('[Bridge:BOSS] Token cached:', t ? 'yes' : 'no');
  });

  console.log('[Bridge:BOSS] __bridge API ready (bridge-api.js)');
})()`;

module.exports = { BRIDGE_API };
