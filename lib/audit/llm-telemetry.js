// lib/audit/llm-telemetry.js — LLM 调用成本追踪
//
// 设计：
// - 每次 LLM 调用一行 JSONL，append-only
// - 价格表写死在这里，模型不在表中则 cost_cny = 0
// - 落盘失败不阻断业务

const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.BOSS_LOG_DIR
  ? path.resolve(process.env.BOSS_LOG_DIR)
  : path.join(__dirname, '..', '..', 'logs');
const TELEMETRY_FILE = path.join(LOG_DIR, 'llm_calls.jsonl');

// ── 价格表 (CNY / 1M tokens) ──
// 来源：各 provider 公开定价页面
// DeepSeek: https://api-docs.deepseek.com/quick_start/pricing
// OpenAI: https://openai.com/api/pricing/
// Anthropic: https://www.anthropic.com/pricing
// 按 1 USD ≈ 7.2 CNY 换算
const PRICING_CNY_PER_M_TOKENS = {
  // DeepSeek
  'deepseek-chat': { input: 1.0, output: 2.0 },
  'deepseek-reasoner': { input: 3.1, output: 6.2 },
  // OpenAI
  'gpt-4o': { input: 17.0, output: 70.0 },
  'gpt-4o-mini': { input: 1.1, output: 4.3 },
  'gpt-4-turbo': { input: 70.0, output: 220.0 },
  // Anthropic Claude
  'claude-sonnet-4-6': { input: 21.0, output: 105.0 },
  'claude-opus-4-7': { input: 105.0, output: 525.0 },
  'claude-haiku-4-5-20251001': { input: 6.0, output: 30.0 },
  // Qwen (通义千问)
  'qwen-turbo': { input: 2.0, output: 4.0 },
  'qwen-plus': { input: 4.0, output: 12.0 },
  'qwen-max': { input: 10.0, output: 30.0 },
  // GLM (智谱)
  'glm-4': { input: 14.0, output: 14.0 },
  'glm-4-flash': { input: 1.0, output: 1.0 },
};

/**
 * 估算单次 LLM 调用成本
 */
function estimateCost(model, inputTokens, outputTokens) {
  const pricing = PRICING_CNY_PER_M_TOKENS[model];
  if (!pricing) return 0;
  return Math.round(
    (inputTokens / 1_000_000 * pricing.input +
     outputTokens / 1_000_000 * pricing.output) * 1e6
  ) / 1e6;
}

/**
 * 记录一次 LLM 调用
 * @param {object} opts
 * @param {string} opts.provider
 * @param {string} opts.model
 * @param {number} opts.inputTokens
 * @param {number} opts.outputTokens
 * @param {number} opts.latencyMs
 * @param {number} [opts.letterLen]
 * @param {boolean} [opts.ok]
 * @param {string} [opts.error]
 */
function recordLLMCall({ provider, model, inputTokens, outputTokens, latencyMs, letterLen = 0, ok = true, error = null }) {
  const cost = estimateCost(model, inputTokens, outputTokens);
  const record = {
    ts: new Date().toISOString(),
    provider,
    model,
    input_tokens: inputTokens || 0,
    output_tokens: outputTokens || 0,
    total_tokens: (inputTokens || 0) + (outputTokens || 0),
    latency_ms: latencyMs || 0,
    cost_cny: cost,
    letter_len: letterLen || 0,
    ok,
    error,
  };

  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(TELEMETRY_FILE, JSON.stringify(record) + '\n');
  } catch (e) {
    // telemetry 落盘失败不能阻断业务
    if (process.env.BOSS_DEBUG) console.warn('[llm-telemetry] 落盘失败:', e.message);
  }

  return record;
}

/**
 * 读取 telemetry 记录
 * @param {number} [limit=200] 最近 N 条
 */
function readTelemetry(limit = 200) {
  if (!fs.existsSync(TELEMETRY_FILE)) return [];
  try {
    const lines = fs.readFileSync(TELEMETRY_FILE, 'utf8').trim().split('\n');
    return lines.slice(-limit).filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

/**
 * 汇总统计
 * @param {number} [since=1000] 最近 N 条
 */
function telemetrySummary(since = 1000) {
  const records = readTelemetry(since);
  if (records.length === 0) {
    return {
      totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCostCny: 0,
      byProvider: {},
    };
  }

  let totalInput = 0, totalOutput = 0, totalCost = 0;
  const byProvider = {};

  for (const r of records) {
    totalInput += r.input_tokens || 0;
    totalOutput += r.output_tokens || 0;
    totalCost += r.cost_cny || 0;

    const p = r.provider || 'unknown';
    if (!byProvider[p]) {
      byProvider[p] = { calls: 0, inputTokens: 0, outputTokens: 0, costCny: 0, totalLatencyMs: 0 };
    }
    byProvider[p].calls++;
    byProvider[p].inputTokens += r.input_tokens || 0;
    byProvider[p].outputTokens += r.output_tokens || 0;
    byProvider[p].costCny = Math.round((byProvider[p].costCny + (r.cost_cny || 0)) * 1e4) / 1e4;
    byProvider[p].totalLatencyMs += r.latency_ms || 0;
  }

  for (const p of Object.keys(byProvider)) {
    const d = byProvider[p];
    d.avgLatencyMs = d.calls > 0 ? Math.round(d.totalLatencyMs / d.calls) : 0;
    delete d.totalLatencyMs;
  }

  return {
    totalCalls: records.length,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCostCny: Math.round(totalCost * 1e4) / 1e4,
    byProvider,
  };
}

module.exports = {
  recordLLMCall,
  readTelemetry,
  telemetrySummary,
  estimateCost,
  PRICING_CNY_PER_M_TOKENS,
};
