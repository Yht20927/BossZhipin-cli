// lib/commands/chat.js — 聊天消息历史（求职者端）
//
// 底层 API：GET /wapi/zpchat/geek/historyMsg?bossId={uid}&securityId={sid}&page&c&src
// bossId = HR 的 uid（encryptUid），securityId = HR 的 securityId（来自 friends/inbox）。
// 支持 @ref 引用。

const { getArg, positionalArgs } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function chat(ctx, args) {
  const positionals = positionalArgs(args);
  let uid = getArg(args, 'uid', '') || positionals[0] || '';
  let securityId = getArg(args, 'securityId', '');
  const page = parseInt(getArg(args, 'page', '1'));
  const count = parseInt(getArg(args, 'count', '20'));

  // @ref 解析
  if (uid.startsWith('@')) {
    const record = ctx.cache.resolve(uid);
    if (!record) {
      throw new Error(`缓存未命中: ${uid}。缓存可能已过期，请重新运行 friends/inbox。`);
    }
    uid = record.encryptUid || record.uid || uid;
    securityId = securityId || record.securityId || '';
    if (record.name || record.bossName) {
      console.error(`[chat] 已从缓存解析: ${record.name || record.bossName}`);
    }
  }

  if (!uid) {
    throw new Error('用法: node cli.js chat <uid|@ref> [--securityId <sid>] [--page 1] [--count 20]\n' +
      '  查看与某 HR 的聊天历史（求职者端）。\n' +
      '  uid        — HR 的 encryptUid（来自 friends / inbox 结果）\n' +
      '  --securityId <sid>  可选，@ref 缓存中自动带出\n' +
      '  示例:\n' +
      '    node cli.js chat @friends-xxx:1\n' +
      '    node cli.js chat <uid> --securityId <sid>');
  }

  const expr = new ExpressionBuilder()
    .call('chatHistory', uid, securityId, page, count)
    .then(ExpressionBuilder.TRANSFORMS.chatHistory)
    .build();

  const result = await ctx.loggedCall('chat', { uid, page }, expr);
  return result;
}

module.exports = { chat };
