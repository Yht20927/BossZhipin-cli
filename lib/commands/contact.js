// lib/commands/contact.js — 发送沟通请求（add friend）

const { getArg, positionalArgs } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function contact(ctx, args) {
  const securityId = positionalArgs(args)[0];
  const jobId = getArg(args, 'jobId', '');
  const lid = getArg(args, 'lid', '');

  if (!securityId || !jobId) {
    throw new Error('用法: node cli.js contact <securityId> --jobId <jobId> [--lid <lid>]\n' +
      '  securityId — 职位 securityId（来自 search 结果）\n' +
      '  jobId      — 职位 encryptJobId（来自 search 结果）\n' +
      '  lid        — 列表追踪 ID（可选，来自 search 结果的 lid）');
  }

  const expr = new ExpressionBuilder()
    .call('addFriend', securityId, jobId, lid)
    .build();

  const result = await ctx.loggedCall('contact', { securityId, jobId, lid }, expr);
  return result;
}

module.exports = { contact };
