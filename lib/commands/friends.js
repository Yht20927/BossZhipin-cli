// lib/commands/friends.js — 聊天会话/联系人列表（求职者端）
//
// 底层 API：GET /wapi/zpgeek/friend/getGeekFriendListV2.json
// 相比旧版 geekFilterByLabel，此接口直接返回完整字段（含 securityId），
// 结果自动缓存 + slim 输出，支持 @ref 引用（chat/chat-send/exchange 复用）。

const { getArg } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function friends(ctx, args) {
  const page = parseInt(getArg(args, 'page', '1'));
  const noCache = args.includes('--no-cache');

  const expr = new ExpressionBuilder()
    .call('chatList', page)
    .then(ExpressionBuilder.TRANSFORMS.chatList)
    .build();

  const result = await ctx.loggedCall('friends', { page }, expr);

  // 自动缓存 + slim 输出
  if (!noCache && result && result.friendList && result.friendList.length > 0) {
    try {
      const invId = ctx.cache.createInvocation('friends', { page });
      ctx.cache.store(invId, result.friendList);
      const slim = ctx.cache.slimOutput(invId, { jobList: result.friendList });
      return { friendList: slim.jobList, _invId: invId };
    } catch (e) {
      console.error(`[friends] 缓存失败: ${e.message}，回退原始输出`);
    }
  }

  return result;
}

module.exports = { friends };
