// lib/commands/industries.js — 行业分类数据

const { ExpressionBuilder } = require('../expression');

async function industries(ctx, args) {
  const expr = new ExpressionBuilder()
    .call('industryData')
    .build();

  const result = await ctx.loggedCall('industries', {}, expr);
  return result;
}

module.exports = { industries };
