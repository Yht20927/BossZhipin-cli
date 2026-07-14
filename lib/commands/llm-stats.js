// lib/commands/llm-stats.js — LLM 调用统计

const { telemetrySummary, readTelemetry } = require('../audit/llm-telemetry');

async function llmStats(ctx, args) {
  const detail = args.includes('--detail') || args.includes('-d');
  const limit = parseInt(
    args.find(a => a.startsWith('--limit='))
      ?.split('=')[1] || '1000'
  );

  const summary = telemetrySummary(limit);

  if (!detail) {
    return {
      ok: true,
      ...summary,
    };
  }

  // 详细模式：包含最近调用记录
  const records = readTelemetry(50);
  return {
    ok: true,
    ...summary,
    recentCalls: records.map(r => ({
      ts: r.ts,
      provider: r.provider,
      model: r.model,
      tokens: r.total_tokens,
      cost: r.cost_cny,
      latencyMs: r.latency_ms,
      ok: r.ok,
      error: r.error,
    })),
  };
}

module.exports = { llmStats };
