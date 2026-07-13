// lib/commands/filters.js — 搜索过滤条件

const { ExpressionBuilder } = require('../expression');

async function filters(ctx, args) {
  const expr = new ExpressionBuilder()
    .call('filterConditions')
    .build();

  const result = await ctx.loggedCall('filters', {}, expr);
  return result;
}

module.exports = { filters };
