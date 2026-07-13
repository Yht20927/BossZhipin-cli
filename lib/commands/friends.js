// lib/commands/friends.js — 好友/联系人列表

const { getArg } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function friends(ctx, args) {
  const labelId = getArg(args, 'label', '0');

  const expr = new ExpressionBuilder()
    .call('friendListByLabel', labelId)
    .then(ExpressionBuilder.TRANSFORMS.friendList)
    .build();

  const result = await ctx.loggedCall('friends', { labelId }, expr);
  return result;
}

module.exports = { friends };
