// lib/commands/job.js — 职位详情
// 支持 @ref 引用语法: node cli.js job @0

const { getArg, positionalArgs, isRef } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function job(ctx, args) {
  let securityId = positionalArgs(args)[0];
  let lid = getArg(args, 'lid', '');

  // ── @ref 解析 ──
  if (isRef(securityId)) {
    const record = ctx.cache.resolve(securityId);
    if (!record) {
      throw new Error(`缓存未命中: ${securityId}。缓存可能已过期，请重新搜索。`);
    }
    securityId = record.securityId;
    lid = lid || record.lid || '';
    console.error(`[job] 已从缓存解析: ${record.jobName} @ ${record.brandName}`);
  }

  if (!securityId) {
    throw new Error('用法: node cli.js job <securityId|@invId:N> [--lid <lid>]\n' +
      '  支持 @ref: node cli.js job @search-260714-131522-a3f2:1');
  }

  const expr = new ExpressionBuilder()
    .call('jobDetail', securityId, lid)
    .then(ExpressionBuilder.TRANSFORMS.jobDetail)
    .build();

  const result = await ctx.loggedCall('job', { securityId, lid }, expr);
  return result;
}

module.exports = { job };
