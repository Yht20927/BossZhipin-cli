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
    secretId = record.encryptUid || record.uid || '';
    // securityId 是职位 ID，不应用于聊天；只有 friends 缓存才有 encryptUid/uid
    if (!secretId && !record.name) {
      throw new Error(`该缓存来自职位搜索，不适用于聊天。请先用 node cli.js friends 获取联系人列表。`);
    }
    if (record.jobName && !record.name) {
      console.error(`[chat] ⚠️ 该缓存来自职位搜索，已自动使用 encryptBossId 作为会话 ID`);
      secretId = record.encryptBossId || '';
    }
    if (record.name) console.error(`[chat] 已从缓存解析: ${record.name}`);
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
