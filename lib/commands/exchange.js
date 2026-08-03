// lib/commands/exchange.js — 请求交换联系方式（手机号/微信）
//
// 打招呼/沟通进展顺利后，向 HR 请求交换手机号或微信。
// 写操作（触发 server 端节流）。支持 @ref 引用。

const { getArg, positionalArgs } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function exchange(ctx, args) {
  let uid = positionalArgs(args)[0] || getArg(args, 'uid', '');
  const type = getArg(args, 'type', 'phone'); // phone | wechat
  let securityId = getArg(args, 'securityId', '');
  let name = getArg(args, 'name', '');

  if (!uid) {
    throw new Error('用法: node cli.js exchange <uid|@ref> [--type phone|wechat] [--securityId <sid>] [--name <name>]\n' +
      '  请求交换联系方式（手机号/微信）。\n' +
      '  uid  — HR 的 encryptUid，支持 @ref（来自 friends / inbox 结果）\n' +
      '  --type phone|wechat   交换类型（默认 phone）\n' +
      '  --securityId <sid>    可选，@ref 缓存中自动带出\n' +
      '  示例:\n' +
      '    node cli.js exchange @friends-xxx:1 --type wechat');
  }

  // @ref 解析：从缓存恢复 encryptUid / securityId / name
  if (uid.startsWith('@')) {
    const record = ctx.cache.resolve(uid);
    if (!record) {
      throw new Error(`缓存未命中: ${uid}。缓存可能已过期，请重新运行 friends/inbox。`);
    }
    uid = record.encryptUid || record.uid || uid;
    securityId = securityId || record.securityId || '';
    name = name || record.name || record.bossName || '';
    if (record.name || record.bossName) {
      console.error(`[exchange] 已从缓存解析: ${record.name || record.bossName}`);
    }
  }

  if (!securityId) {
    throw new Error('[exchange] 缺少 securityId — 请用 --securityId 指定，或通过 @ref 从缓存获取');
  }

  const typeId = type === 'wechat' ? 2 : 1;
  const typeLabel = type === 'wechat' ? '微信' : '手机号';

  const expr = new ExpressionBuilder()
    .call('exchangeRequest', securityId, uid, name, typeId)
    .build();

  const result = await ctx.loggedCall('exchange', { uid, type }, expr);
  const ok = result && (result.code === 0 || result.code === '0');
  console.error(`[exchange] ${ok ? '✅' : '❌'} 请求交换${typeLabel}: ${ok ? '' : (result?.message || '失败')}`);
  return { ok: !!ok, type, target: name || uid, ...(result || {}) };
}

module.exports = { exchange };
