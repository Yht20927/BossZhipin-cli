// lib/commands/refresh.js — 刷新 BOSS 会话（修复 code:37 / token 过期）
//
// 原理: 导航到 BOSS 职位页 → 触发完整的页面加载 → BOSS 重新初始化
// → token 自动刷新 → 油猴脚本重连 Bridge Server

const { ExpressionBuilder } = require('../expression');

async function refresh(ctx, args) {
  console.error('[refresh] 正在刷新 BOSS 会话...');

  // 发送导航指令（这个 eval 不会返回有意义的结果，因为页面会跳转）
  const expr = new ExpressionBuilder()
    .call('refreshSession')
    .build();

  try {
    // awaitPromise=false: 页面导航会导致 Promise 永远不 resolve
    await ctx.bridgeCall(expr, false);
    console.error('[refresh] 导航指令已发送，页面正在跳转...');
  } catch (e) {
    // 预期行为：页面跳转导致连接断开或超时
    if (!e.message.includes('ECONNREFUSED') && !e.message.includes('timeout')) {
      console.error(`[refresh] 导航时出现非预期错误: ${e.message}`);
    }
  }

  // 等待油猴脚本重连（新页面加载 → 脚本初始化 → 注册连接）
  // 最多等 30 秒
  console.error('[refresh] 等待 Bridge 重连...');
  const maxWait = 30000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const st = await ctx.bridge.status();
      if (st.ok && st.totalConnections > 0) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        console.error(`[refresh] ✅ Bridge 已重连 (${elapsed}s)，会话已刷新`);
        return {
          ok: true,
          reconnected: true,
          elapsedSec: elapsed,
          connections: st.totalConnections,
        };
      }
    } catch (e) {
      // 重连中...
    }
  }

  throw new Error('[refresh] 重连超时 (30s)，请检查浏览器是否已打开 BOSS 页面');
}

module.exports = { refresh };
