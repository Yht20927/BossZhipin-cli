// lib/commands/contact.js — 发送沟通请求（add friend）
// 支持 @ref 引用语法: node cli.js contact @0 或 @search-240714-131522-a3f2:3

const { getArg, positionalArgs, isRef } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function contact(ctx, args) {
  let securityId = positionalArgs(args)[0];
  let jobId = getArg(args, 'jobId', '');
  let lid = getArg(args, 'lid', '');

  // ── @ref 解析 ──
  if (isRef(securityId)) {
    const record = ctx.cache.resolve(securityId);
    if (!record) {
      throw new Error(`缓存未命中: ${securityId}。缓存可能已过期，请重新搜索。`);
    }
    securityId = record.securityId;
    jobId = jobId || record.encryptJobId || '';
    lid = lid || record.lid || '';
    console.error(`[contact] 已从缓存解析: ${securityId.slice(0, 20)}...`);
  }

  if (!securityId || (!jobId && isRef(positionalArgs(args)[0]) ? false : !jobId)) {
    throw new Error('用法: node cli.js contact <securityId|@invId:N> [--jobId <jobId>] [--lid <lid>]\n' +
      '  支持 @ref: node cli.js contact @search-260714-131522-a3f2:1\n' +
      '  securityId — 职位 securityId（来自 search 结果）\n' +
      '  jobId      — 职位 encryptJobId（来自 search 结果）\n' +
      '  lid        — 列表追踪 ID（可选）');
  }

  const expr = new ExpressionBuilder()
    .call('addFriend', securityId, jobId, lid)
    .build();

  const result = await ctx.loggedCall('contact', { securityId, jobId, lid }, expr);
  return result;
}

module.exports = { contact };
