// lib/commands/resume.js — 简历完成度

const { ExpressionBuilder } = require('../expression');

async function resume(ctx, args) {
  const expr = new ExpressionBuilder()
    .call('resumeStep')
    .build();

  const result = await ctx.loggedCall('resume', {}, expr);
  return result;
}

module.exports = { resume };
