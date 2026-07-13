// lib/commands/chat.js — 消息历史

const { getArg } = require('./helpers');
const { ExpressionBuilder } = require('../expression');

async function chat(ctx, args) {
  const secretId = getArg(args, 'secretId', '');
  const lastId = getArg(args, 'lastId', '');
  const type = getArg(args, 'type', '0');

  const expr = new ExpressionBuilder()
    .call('msgHistory', type, lastId, secretId)
    .build();

  const result = await ctx.loggedCall('chat', { type, lastId }, expr);
  return result;
}

module.exports = { chat };
