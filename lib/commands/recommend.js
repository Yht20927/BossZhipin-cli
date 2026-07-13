// lib/commands/recommend.js — 推荐职位

const { getArg } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function recommend(ctx, args) {
  const city = getArg(args, 'city', '100010000');
  const page = parseInt(getArg(args, 'page', '1'));

  const expr = new ExpressionBuilder()
    .callObj('recommendJobs', { city, page, pageSize: 15, encryptExpectId: '' })
    .then(ExpressionBuilder.TRANSFORMS.jobList)
    .build();

  const result = await ctx.loggedCall('recommend', { city, page }, expr);
  return result;
}

module.exports = { recommend };
