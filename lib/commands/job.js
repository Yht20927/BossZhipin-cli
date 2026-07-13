// lib/commands/job.js — 职位详情

const { getArg, positionalArgs } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function job(ctx, args) {
  const securityId = positionalArgs(args)[0];
  const lid = getArg(args, 'lid', '');

  if (!securityId) {
    throw new Error('用法: node cli.js job <securityId> [--lid <lid>]');
  }

  const expr = new ExpressionBuilder()
    .call('jobDetail', securityId, lid)
    .then(ExpressionBuilder.TRANSFORMS.jobDetail)
    .build();

  const result = await ctx.loggedCall('job', { securityId, lid }, expr);
  return result;
}

module.exports = { job };
