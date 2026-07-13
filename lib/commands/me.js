// lib/commands/me.js — 用户信息

const { ExpressionBuilder } = require('../expression');

async function me(ctx, args) {
  const expr = new ExpressionBuilder()
    .call('getUserInfo')
    .build();

  const result = await ctx.loggedCall('me', {}, expr);
  return result;
}

module.exports = { me };
