// lib/commands/resume.js — 我的简历信息（求职者端）
//
// 聚合：基本信息(baseinfo) + 期望职位(expect) + 简历状态(status) + 完成度(step)。
// 底层 API（逆向确认）：
//   /wapi/zpgeek/resume/baseinfo/query.json
//   /wapi/zpgeek/resume/expect/query.json
//   /wapi/zpgeek/resume/status.json
//   /wapi/zpgeek/resume/complete/step.json

const { ExpressionBuilder } = require('../expression');

async function resume(ctx, args) {
  const baseinfoExpr = new ExpressionBuilder().call('resumeBaseinfo').build();
  const expectExpr = new ExpressionBuilder().call('resumeExpect').build();
  const statusExpr = new ExpressionBuilder().call('resumeStatus').build();
  const stepExpr = new ExpressionBuilder().call('resumeStep').build();

  // 串行调用（Bridge eval 在同一页面执行，串行避免并发竞态）
  const baseinfo = await ctx.loggedCall('resume:baseinfo', {}, baseinfoExpr);
  const expect = await ctx.loggedCall('resume:expect', {}, expectExpr);
  const status = await ctx.loggedCall('resume:status', {}, statusExpr);
  const step = await ctx.loggedCall('resume:step', {}, stepExpr);

  return { baseinfo, expect, status, step };
}

module.exports = { resume };
