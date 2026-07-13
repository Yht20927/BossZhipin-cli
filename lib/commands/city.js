// lib/commands/city.js — 城市站点数据

const { ExpressionBuilder } = require('../expression');

async function city(ctx, args) {
  const expr = new ExpressionBuilder()
    .call('citySite')
    .then(ExpressionBuilder.TRANSFORMS.cityList)
    .build();

  const result = await ctx.loggedCall('city', {}, expr);
  return result;
}

module.exports = { city };
