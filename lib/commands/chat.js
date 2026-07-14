// lib/commands/chat.js — 消息历史
// 支持 @ref 引用语法: node cli.js chat @0

const { getArg, isRef } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function chat(ctx, args) {
  let secretId = getArg(args, 'secretId', '');
  const lastId = getArg(args, 'lastId', '');
  const type = getArg(args, 'type', '0');

  // ── @ref 解析 ──
  // 尝试从位置参数读取 ref
  const allArgs = args.filter(a => !a.startsWith('--'));
  const refArg = allArgs.find(a => isRef(a));
  if (refArg && !secretId) {
    const record = ctx.cache.resolve(refArg);
    if (!record) {
      throw new Error(`缓存未命中: ${refArg}。缓存可能已过期，请重新搜索/friends。`);
    }
    // friends 缓存中有 encryptUid/uid 可用作 secretId
    secretId = record.encryptUid || record.uid || record.securityId || '';
    if (record.jobName) console.error(`[chat] 已从缓存解析: ${record.name || record.jobName}`);
  }

  if (!secretId && isRef(getArg(args, 'secretId', ''))) {
    const record = ctx.cache.resolve(getArg(args, 'secretId', ''));
    if (record) {
      secretId = record.encryptUid || record.uid || record.securityId || '';
    }
  }

  const expr = new ExpressionBuilder()
    .call('msgHistory', type, lastId, secretId)
    .build();

  const result = await ctx.loggedCall('chat', { type, lastId }, expr);
  return result;
}

module.exports = { chat };
