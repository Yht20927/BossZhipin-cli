// lib/commands/llm-reply.js — LLM 生成聊天回复（求职者端跟进）
//
// 流程: 拉取聊天上下文 → LLM 基于对方消息 + 简历生成回复 → 审核 → 发送（--send）。
// 复用 chat-send 的 sendMessage（含自动导航聊天页 + 重连重试）。

const fs = require('fs');
const path = require('path');
const { getArg, positionalArgs } = require('./helpers');
const { ExpressionBuilder } = require('../expression');
const { generateReply } = require('../llm');
const { sendMessage } = require('./chat-send');
const { validateLetter } = require('./llm-greet');

async function llmReply(ctx, args) {
  const positionals = positionalArgs(args);
  let uid = positionals[0] || '';
  const incoming = getArg(args, 'msg', '') || getArg(args, 'text', '') || positionals.slice(1).join(' ');
  const dryRun = args.includes('--dry-run');
  const send = args.includes('--send');
  const resumePath = getArg(args, 'resume', '');
  const userName = getArg(args, 'name', process.env.BOSS_USR_NAME || '求职者');

  // @ref 解析
  let securityId = getArg(args, 'securityId', '');
  if (uid.startsWith('@')) {
    const record = ctx.cache.resolve(uid);
    if (!record) {
      throw new Error(`缓存未命中: ${uid}。缓存可能已过期，请重新运行 friends/inbox/unread。`);
    }
    securityId = securityId || record.securityId || '';
    if (record.name || record.bossName) {
      console.error(`[llm-reply] 已从缓存解析: ${record.name || record.bossName}`);
    }
    uid = record.encryptUid || record.uid || uid;
  }

  if (!uid) {
    throw new Error('用法: node cli.js llm-reply <uid|@ref> "对方消息" [--send] [--resume <path>]\n' +
      '  基于对方消息 + 聊天上下文生成自然回复，可预览或直接发送。\n' +
      '  uid      — HR 的 encryptUid，支持 @ref（来自 friends/inbox/unread）\n' +
      '  消息     — 对方刚发来的消息（放引号内）\n' +
      '  --send   — 生成后直接发送（默认只预览）\n' +
      '  --dry-run — 仅预览不发送\n' +
      '  --resume <path> — 简历文本，用于生成更贴合自己的回复\n' +
      '  环境变量: LLM_API_KEY / LLM_BASE_URL / LLM_MODEL');
  }

  // ── Step 1: 拉取聊天历史作上下文 ──
  let context = '';
  try {
    const histExpr = new ExpressionBuilder()
      .call('chatHistory', uid, securityId, 1, 5)
      .then(ExpressionBuilder.TRANSFORMS.chatHistory)
      .build();
    const hist = await ctx.loggedCall('llm-reply:history', { uid }, histExpr);
    if (hist && hist.messages && hist.messages.length > 0) {
      context = hist.messages.map(m =>
        `${m.received ? '对方' : '我'}: ${m.text || '(非文本消息)'}`
      ).join('\n');
      console.error(`[llm-reply] 已加载 ${hist.messages.length} 条历史消息作上下文`);
    }
  } catch (e) {
    console.error(`[llm-reply] 拉取聊天历史失败（不阻塞）: ${e.message}`);
  }

  // ── Step 2: 读取简历（如有）──
  let resumeText = '';
  if (resumePath) {
    const resolved = path.resolve(resumePath);
    if (fs.existsSync(resolved)) {
      resumeText = fs.readFileSync(resolved, 'utf8');
      console.error(`[llm-reply] 简历: ${resolved} (${resumeText.length} 字)`);
    } else {
      console.error(`[llm-reply] 简历文件不存在: ${resolved}，不使用简历上下文`);
    }
  }

  // ── Step 3: LLM 生成回复 ──
  console.error('[llm-reply] 调用 LLM 生成回复...');
  let reply;
  try {
    reply = await generateReply({ incoming, context, resumeText, userName });
  } catch (e) {
    throw new Error(`LLM 生成回复失败: ${e.message}`);
  }

  console.error(`[llm-reply] 回复 (${reply.length} 字):`);
  console.error('───');
  console.error(reply);
  console.error('───');

  // ── Step 4: 审核 ──
  const validation = validateLetter(reply);
  if (!validation.ok) {
    console.error(`[llm-reply] ⛔ 审核不通过: ${validation.reasons.join(', ')}`);
    if (dryRun) {
      return { ok: false, stage: 'validation_failed', reasons: validation.reasons, reply };
    }
    throw new Error(`回复审核不通过: ${validation.reasons.join(', ')}`);
  }

  // ── Step 5: 预览 / 发送 ──
  if (dryRun || !send) {
    console.error(send ? '[llm-reply] DRY-RUN: 不会实际发送' : '[llm-reply] 预览完成。加 --send 发送，或 --dry-run 仅预览。');
    return { ok: true, dryRun: true, uid, incoming, reply, validation };
  }

  console.error('[llm-reply] 发送回复...');
  return sendMessage(ctx, uid, reply);
}

module.exports = { llmReply };
