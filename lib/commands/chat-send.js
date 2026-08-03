// lib/commands/chat-send.js — 向 HR 发送聊天消息（求职者端）
//
// BOSS 聊天发送走 MQTT（非 HTTP），无法直接调 HTTP API，采用 UI 自动化：
//   导航到 /web/geek/chat → 点击目标会话 → 聚焦输入框 → 输入 → 发送。
// 若不在聊天页，自动导航 + 等待 Bridge 重连后重试。
//
// 这是打招呼之后的跟进动作：对方回复后，用本命令继续对话。
// sendMessage 为公共发送函数，llm-reply 也复用（生成回复后发送）。

const { getArg, positionalArgs } = require('./helpers');
const { ExpressionBuilder } = require('../expression');
const { waitForBridgeReconnect } = require('./helpers');

/**
 * 向指定 HR 发送聊天消息（含自动导航聊天页 + 重连重试）。
 * @param {object} ctx
 * @param {string} uid - HR 的 encryptUid（非 @ref，已解析）
 * @param {string} text - 消息内容
 * @returns {Promise<object>}
 */
async function sendMessage(ctx, uid, text) {
  const expr = new ExpressionBuilder()
    .call('sendChatMessage', uid, text)
    .build();

  // 第一次尝试（假设已在聊天页）
  let r;
  try {
    r = await ctx.loggedCall('chat-send', { uid, textLen: text.length }, expr);
  } catch (e) {
    r = { notOnChatPage: true, error: e.message };
  }

  // 不在聊天页 → 导航 + 等待重连 + 重试
  if (r && r.notOnChatPage) {
    console.error(`[chat-send] 不在聊天页，导航到 ${r.needNavigate || '/web/geek/chat'}...`);
    const navExpr = new ExpressionBuilder().call('navigateToChat').build();
    try {
      await ctx.bridgeCall(navExpr, false); // 页面跳转，Promise 不会 resolve，awaitPromise=false
    } catch (e) { /* 页面跳转会断连/超时，属预期 */ }

    console.error('[chat-send] 等待 Bridge 重连...');
    const reconnected = await waitForBridgeReconnect(ctx);
    if (!reconnected) {
      throw new Error('[chat-send] Bridge 重连超时，请确认浏览器已打开 zhipin.com 聊天页');
    }
    console.error('[chat-send] 已重连，重试发送...');
    r = await ctx.loggedCall('chat-send', { uid, textLen: text.length }, expr);
  }

  if (r && r.ok) {
    console.error(`[chat-send] ✅ 已发送: ${text}`);
    return { ok: true, uid, text };
  }
  return r || { ok: false, error: '未知错误' };
}

async function chatSend(ctx, args) {
  const positionals = positionalArgs(args);
  let uid = getArg(args, 'uid', '') || positionals[0] || '';
  const text = getArg(args, 'text', '') || positionals.slice(1).join(' ') || '';

  if (!uid || !text) {
    throw new Error('用法: node cli.js chat-send <uid> <text>\n' +
      '  向 HR 发送聊天消息（求职者端）。\n' +
      '  uid  — HR 的 encryptUid，支持 @ref（来自 friends / inbox / unread 结果）\n' +
      '  text — 消息内容（多个词自动拼接；含空格用引号包裹）\n' +
      '  示例:\n' +
      '    node cli.js chat-send @friends-xxx:1 "您好，请问还招人吗？"\n' +
      '    node cli.js chat-send "9c833990a839f1251Hx92du5GA~~" 请问这个岗位要求几年经验？');
  }

  // @ref 解析：从缓存恢复 encryptUid
  if (uid.startsWith('@')) {
    const record = ctx.cache.resolve(uid);
    if (!record) {
      throw new Error(`缓存未命中: ${uid}。缓存可能已过期，请重新运行 friends/inbox/unread。`);
    }
    const resolved = record.encryptUid || record.uid || '';
    if (!resolved) {
      throw new Error(`缓存记录缺少 uid（encryptUid），无法发送消息: ${uid}`);
    }
    console.error(`[chat-send] 已从缓存解析: ${record.name || record.bossName || 'HR'} (${resolved.slice(0, 16)}...)`);
    uid = resolved;
  }

  return sendMessage(ctx, uid, text);
}

module.exports = { chatSend, sendMessage };
