// lib/commands/friends.js — 好友/联系人列表（支持自动缓存 + slim 输出）

const { getArg } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function friends(ctx, args) {
  const labelId = getArg(args, 'label', '0');
  const noCache = args.includes('--no-cache');

  const expr = new ExpressionBuilder()
    .call('friendListByLabel', labelId)
    .then(ExpressionBuilder.TRANSFORMS.friendList)
    .build();

  const result = await ctx.loggedCall('friends', { labelId }, expr);

  // 自动缓存 + slim 输出（friends 用 uid/encryptUid 替代 securityId）
  if (!noCache && result && result.friendList && result.friendList.length > 0) {
    try {
      const invId = ctx.cache.createInvocation('friends', { labelId });
      // friends 记录中长 ID 字段不同: uid, encryptUid, securityId, encryptJobId, encryptBossId
      ctx.cache.store(invId, result.friendList);
      const slim = ctx.cache.slimOutput(invId, { jobList: result.friendList });
      return {
        friendList: slim.jobList,
        foldText: result.foldText,
        _invId: invId,
      };
    } catch (e) {
      console.error(`[friends] 缓存失败: ${e.message}，回退原始输出`);
    }
  }

  return result;
}

module.exports = { friends };
