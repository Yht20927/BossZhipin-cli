#!/usr/bin/env node
// cli.js — BOSS 直聘 CLI（Bridge Framework 版）
//
// 依赖 Bridge Server (server.js) 运行中，
// 且浏览器已安装油猴脚本 scripts/boss_zhipin.user.js 并打开 zhipin.com 页面。

const fs = require('fs');
const path = require('path');
const { AuditLogger } = require('./lib/audit');
const { BridgeClient } = require('./lib/client/bridge-client');
const { transformResult } = require('./lib/transform');
const commands = require('./lib/commands');
const { SITE } = require('./lib/commands/helpers');

// Bridge 自愈代码：由 server/router.js 按需注入（每个 site 首次 eval 时自动 prepend）
// 共享模块位于 lib/shared/bootstrap.js，cli.js 和 server/router.js 共用
const { BRIDGE_BOOTSTRAP } = require('./lib/shared/bootstrap');

// ── 配置 ──
let config = {};
try { config = require('./config.json'); } catch (e) { /* use defaults */ }

// ── Bridge 客户端 ──
const bridge = new BridgeClient({
  host: config.bridge?.host || '127.0.0.1',
  port: config.bridge?.port || 19425,
  token: config.bridge?.token || '',
});

// ── 审计日志 ──
const audit = new AuditLogger();
let noLog = false;

// ═══════════════════════════════════════════════════════════
// Bridge 通信
// ═══════════════════════════════════════════════════════════

async function bridgeCall(expression, awaitPromise = true) {
  // BRIDGE_BOOTSTRAP 自愈注入已移至 server/router.js 的 _call 方法：
  // 服务器在首次向某 site 派发 eval 时自动 prepend，后续请求不再携带
  const resp = await bridge.call({ site: SITE, expression, awaitPromise });
  if (!resp.ok) throw new Error(resp.error || 'Bridge Server 返回未知错误');
  const v = resp.value;
  // boss envelope 检测：{ code, message, zpData }
  if (v && typeof v === 'object' && 'code' in v && v.code !== 0 && v.code !== '0') {
    const msg = v.message || 'unknown';
    const err = new Error(`boss[${v.code}] ${msg}`);
    err.code = v.code;
    err.envelope = v;
    throw err;
  }
  // 正常包：返回 zpData 字段（若有），否则返回整个 v
  if (v && typeof v === 'object' && 'code' in v && 'zpData' in v) return v.zpData;
  return v;
}

async function loggedCall(endpoint, params, expression) {
  const t0 = Date.now();
  try {
    const rawResult = await bridgeCall(expression);
    const result = transformResult(rawResult, endpoint);
    const ms = Date.now() - t0;
    const sum = {};
    if (result) {
      if (result.jobList) sum.count = result.jobList.length;
      if (result.hasMore !== undefined) sum.hasMore = result.hasMore;
      if (result.resCount !== undefined) sum.resCount = result.resCount;
      if (result.userId !== undefined) sum.userId = result.userId;
    }
    audit.logApiCall(endpoint, params, ms, 'success', sum);
    return result;
  } catch (e) {
    audit.logApiCall(endpoint, params, Date.now() - t0, 'error', { error: e.message });
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════
// 命令上下文
// ═══════════════════════════════════════════════════════════

const ctx = {
  bridge,
  audit,
  config,
  bridgeCall,
  loggedCall,
  cmdSearch: null,
  cmdJob: null,
  cmdMe: null,
  cmdFriends: null,
  cmdChat: null,
  cmdCity: null,
  cmdRecommend: null,
};

ctx.cmdSearch = (args) => commands.search(ctx, args);
ctx.cmdJob = (args) => commands.job(ctx, args);
ctx.cmdMe = (args) => commands.me(ctx, args);
ctx.cmdFriends = (args) => commands.friends(ctx, args);
ctx.cmdChat = (args) => commands.chat(ctx, args);
ctx.cmdCity = (args) => commands.city(ctx, args);
ctx.cmdRecommend = (args) => commands.recommend(ctx, args);
ctx.cmdFilters = (args) => commands.filters(ctx, args);
ctx.cmdIndustries = (args) => commands.industries(ctx, args);
ctx.cmdResume = (args) => commands.resume(ctx, args);
ctx.cmdExpect = (args) => commands.expect(ctx, args);

// ═══════════════════════════════════════════════════════════
// 帮助
// ═══════════════════════════════════════════════════════════

function printHelp() {
  console.log(`
BOSS Zhipin CLI (Bridge Framework)

  职位搜索：
  node cli.js search <keyword> [--city 101290100] [--page 1] [--pageSize 15]
      搜索职位 — 支持 --experience --degree --salary --industry --scale --jobType
      管线选项: --min-salary <K> --sort salary-desc --limit 10 --dedup --enrich

  node cli.js recommend [--city 101290100] [--page 1]
      推荐职位列表（固定 15 条/页）

  node cli.js job <securityId> [--lid <lid>]
      职位详情

  个人/社交：
  node cli.js me
      获取当前用户信息

  node cli.js friends [--label 0]
      获取好友/联系人列表

  node cli.js chat --secretId <secretId> [--lastId <id>] [--type 0]
      拉取聊天消息历史

  node cli.js resume
      查看简历完成度

  node cli.js expect
      查看期望职位列表

  数据/参考：
  node cli.js city
      获取城市站点数据

  node cli.js filters
      获取搜索过滤条件（薪资区间/经验/学历等）

  node cli.js industries
      获取行业分类数据

  系统：
  node cli.js status
      查看 Bridge 连接状态

  前置条件：
  1. Bridge Server 运行中: node server.js
  2. 浏览器已安装油猴脚本 scripts/boss_zhipin.user.js
  3. 浏览器已打开 zhipin.com 任意页面（需登录）
`);
}

// ═══════════════════════════════════════════════════════════
// 入口
// ═══════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const rawMode = args.includes('--raw');
  noLog = args.includes('--no-log');
  audit.setNoLog(noLog);

  if (!cmd || cmd === 'help' || cmd === '--help') {
    printHelp();
    return;
  }

  // 内建命令
  if (cmd === 'status') {
    try {
      const st = await bridge.status();
      console.log(JSON.stringify(st, null, 2));
    } catch (e) {
      console.error(`错误: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  const handler = commands[cmd];
  if (!handler) {
    console.error(`未知命令: ${cmd}`);
    console.error('运行 "node cli.js help" 查看用法。');
    process.exit(1);
  }

  try {
    const result = await handler(ctx, args.slice(1));
    if (result !== undefined) {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (e) {
    if (!noLog && audit._currentOp) {
      audit.endOperation('error', {}, null, e.message);
    }
    if (e.message.includes('ECONNREFUSED') || e.message.includes('Bridge Server 未启动')) {
      console.error('错误: Bridge Server 未启动，请先运行:');
      console.error('  node server.js');
    } else if (e.message.includes('Unauthorized')) {
      console.error('错误: 认证失败 — 请检查 config.json 中的 bridge.token');
    } else {
      console.error(`错误: ${e.message}`);
    }
    process.exit(1);
  }
}

main();
