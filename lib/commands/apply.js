// lib/commands/apply.js — 我的投递记录（求职者端）
//
// 展示所有已投递职位的状态：已投递 / 已查看 / 沟通中 / 待面试 / 已面试 / 已录用 / 不合适 等。
// 用于追踪投递进展，不打开 App 也能看到每条投递走到了哪一步。

const { getArg } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

// BOSS 直聘投递状态码映射
const APPLY_STATUS = {
  0: '已投递',
  1: '已查看',
  2: '沟通中',
  3: '待面试',
  4: '已面试',
  5: '已录用',
  6: '不合适',
  7: '已拒绝',
  8: '已过期',
};

async function apply(ctx, args) {
  const page = parseInt(getArg(args, 'page', '1'));
  const status = getArg(args, 'status', ''); // 如「面试」「不合适」

  const expr = new ExpressionBuilder()
    .call('deliverList', page)
    .then(ExpressionBuilder.TRANSFORMS.deliverList)
    .build();

  const result = await ctx.loggedCall('apply', { page }, expr);
  if (!result || !result.deliverList) return result;

  let list = result.deliverList.map(j => ({
    ...j,
    statusText: APPLY_STATUS[j.deliverStatus] || `其他(${j.deliverStatus})`,
  }));

  // 状态筛选（按文字包含，如 --status 面试 匹配「待面试/已面试」）
  if (status) {
    const before = list.length;
    list = list.filter(j => (j.statusText || '').includes(status));
    console.error(`[apply] 状态筛选 "${status}": ${list.length}/${before} 条`);
  }

  const counts = {};
  for (const j of result.deliverList) {
    const t = APPLY_STATUS[j.deliverStatus] || '其他';
    counts[t] = (counts[t] || 0) + 1;
  }

  return { deliverList: list, count: list.length, statusCounts: counts };
}

module.exports = { apply };
