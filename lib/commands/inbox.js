// lib/commands/inbox.js — 收到的 HR 招呼列表（求职者端）
//
// 对应 /web/geek/chat 的「新招呼」：哪些 HR 向你打了招呼。
// 可结合 chat-send 主动回复感兴趣的机会。
// 结果自动缓存，支持 @ref 引用。

const { getArg } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function inbox(ctx, args) {
  const page = parseInt(getArg(args, 'page', '1'));
  const noCache = args.includes('--no-cache');

  const expr = new ExpressionBuilder()
    .call('newGreets', page)
    .then(ExpressionBuilder.TRANSFORMS.newGreets)
    .build();

  const result = await ctx.loggedCall('inbox', { page }, expr);
  if (!result || !result.greetList) return result;

  // 自动缓存 + slim 输出
  if (!noCache && result.greetList.length > 0) {
    try {
      const invId = ctx.cache.createInvocation('inbox', { page });
      ctx.cache.store(invId, result.greetList);
      const slim = ctx.cache.slimOutput(invId, { jobList: result.greetList });
      return { greetList: slim.jobList, _invId: invId };
    } catch (e) {
      console.error(`[inbox] 缓存失败: ${e.message}，回退原始输出`);
    }
  }

  return result;
}

module.exports = { inbox };
