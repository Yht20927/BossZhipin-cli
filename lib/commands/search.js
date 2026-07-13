// lib/commands/search.js — 搜索职位（支持管线后处理）

const { getArg, positionalArgs } = require('./helpers');
const { ExpressionBuilder } = require('../expression');
const { Pipeline } = require('../pipeline');
const { salaryAbove, excludeNegotiable, hasAnySkill, bossOnline } = require('../pipeline/filters');
const { enrichSalary } = require('../pipeline/enrich');

async function search(ctx, args) {
  const city = getArg(args, 'city', '100010000');
  const page = parseInt(getArg(args, 'page', '1'));
  const pageSize = parseInt(getArg(args, 'pageSize', '15'));
  const experience = getArg(args, 'experience', '');
  const degree = getArg(args, 'degree', '');
  const salary = getArg(args, 'salary', '');
  const industry = getArg(args, 'industry', '');
  const scale = getArg(args, 'scale', '');
  const jobType = getArg(args, 'jobType', '');
  const query = positionalArgs(args).join(' ') || '';

  // 管线参数
  const minSalary = parseInt(getArg(args, 'min-salary', '0'));
  const maxSalary = parseInt(getArg(args, 'max-salary', '0'));
  const limit = parseInt(getArg(args, 'limit', '0'));
  const sortBy = getArg(args, 'sort', '');
  const skills = getArg(args, 'skills', '');
  const enrich = args.includes('--enrich');
  const dedup = args.includes('--dedup');
  const onlineOnly = args.includes('--online');
  const noNegotiable = args.includes('--no-negotiable');

  const expr = new ExpressionBuilder()
    .callObj('search', { query, city, page, pageSize, experience, degree, salary, industry, scale, jobType, scene: 1, encryptExpectId: '' })
    .then(ExpressionBuilder.TRANSFORMS.jobList)
    .build();

  const result = await ctx.loggedCall('search', { query, city, page, pageSize }, expr);

  // 管线后处理
  if (result && result.jobList && result.jobList.length > 0) {
    const pipe = new Pipeline();

    if (noNegotiable) pipe.filter(excludeNegotiable());
    if (minSalary > 0) pipe.filter(salaryAbove(minSalary));
    if (onlineOnly) pipe.filter(bossOnline());
    if (skills) pipe.filter(hasAnySkill(skills.split(',').map(s => s.trim())));
    if (dedup) pipe.dedup(j => j.encryptJobId || j.securityId);
    if (enrich) pipe.enrich(enrichSalary);

    // 排序
    if (sortBy === 'salary-asc') {
      const { salaryMinK } = require('../pipeline/filters');
      pipe.sort((a, b) => (salaryMinK(a) || 0) - (salaryMinK(b) || 0));
    } else if (sortBy === 'salary-desc') {
      const { salaryMinK } = require('../pipeline/filters');
      pipe.sort((a, b) => (salaryMinK(b) || 0) - (salaryMinK(a) || 0));
    }

    if (limit > 0) pipe.limit(limit);

    result.jobList = pipe.run(result.jobList);
    result._pipelineCount = result.jobList.length;
  }

  return result;
}

module.exports = { search };
