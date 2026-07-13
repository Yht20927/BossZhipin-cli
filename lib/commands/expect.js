// lib/commands/expect.js — 期望职位列表

const { ExpressionBuilder } = require('../expression');

async function expect(ctx, args) {
  const expr = new ExpressionBuilder()
    .call('expectList')
    .build();

  const result = await ctx.loggedCall('expect', {}, expr);
  return result;
}

module.exports = { expect };
