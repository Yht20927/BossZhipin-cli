// lib/commands/recommend.js — 推荐职位（支持自动缓存 + slim 输出）

const { getArg } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function recommend(ctx, args) {
  const city = getArg(args, 'city', '100010000');
  const page = parseInt(getArg(args, 'page', '1'));
  const noCache = args.includes('--no-cache');

  const expr = new ExpressionBuilder()
    .callObj('recommendJobs', { city, page, pageSize: 15, encryptExpectId: '' })
    .then(ExpressionBuilder.TRANSFORMS.jobList)
    .build();

  const result = await ctx.loggedCall('recommend', { city, page }, expr);

  // 自动缓存 + slim 输出
  if (!noCache && result && result.jobList && result.jobList.length > 0) {
    try {
      const invId = ctx.cache.createInvocation('recommend', { city, page });
      ctx.cache.store(invId, result.jobList, {
        topLevel: { resCount: result.resCount, hasMore: result.hasMore, lid: result.lid },
      });
      return ctx.cache.slimOutput(invId, result);
    } catch (e) {
      console.error(`[recommend] 缓存失败: ${e.message}，回退原始输出`);
    }
  }

  return result;
}

module.exports = { recommend };
