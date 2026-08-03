// lib/commands/unread.js — 未读会话看板（求职者端）
//
// 基于 chatList（getGeekFriendListV2）过滤出未读会话，列出需要跟进的对象。
// 用于求职跟进：打招呼后对方回复了却未处理，用本命令一眼看出该回复谁。

const { getArg } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function unread(ctx, args) {
  const page = parseInt(getArg(args, 'page', '1'));
  const noCache = args.includes('--no-cache');

  const expr = new ExpressionBuilder()
    .call('chatList', page)
    .then(ExpressionBuilder.TRANSFORMS.chatList)
    .build();

  const result = await ctx.loggedCall('unread', { page }, expr);
  if (!result || !result.friendList) {
    return { ok: false, error: '无法获取会话列表' };
  }

  const unreadConvs = result.friendList
    .filter(f => (f.unreadMsgCount || 0) > 0)
    .map(f => ({
      bossName: f.name || f.bossTitle || 'HR',
      brandName: f.brandName,
      jobName: f.jobName,
      lastMsg: f.lastMsg,
      unread: f.unreadMsgCount,
      encryptUid: f.encryptUid,
      securityId: f.securityId,
    }));

  const totalUnread = unreadConvs.reduce((s, c) => s + (c.unread || 0), 0);

  // 自动缓存（支持 @ref 引用直接 chat/chat-send）
  if (!noCache && unreadConvs.length > 0) {
    try {
      const invId = ctx.cache.createInvocation('unread', { page });
      ctx.cache.store(invId, unreadConvs);
      return {
        unreadCount: unreadConvs.length,
        totalUnread,
        conversations: ctx.cache.slimOutput(invId, { jobList: unreadConvs }).jobList,
        _invId: invId,
      };
    } catch (e) {
      console.error(`[unread] 缓存失败: ${e.message}`);
    }
  }

  return { unreadCount: unreadConvs.length, totalUnread, conversations: unreadConvs };
}

module.exports = { unread };
