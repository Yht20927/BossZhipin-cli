// lib/llm/index.js — LLM 调用统一封装（OpenAI 兼容端点）
//
// 设计:
// - 统一 OpenAI 兼容端点 = LLM_BASE_URL + LLM_API_KEY + LLM_MODEL
// - DeepSeek / OpenAI / Claude / Ollama / 各种中转都是这一条路
// - generateLetter 是招呼语生成入口
// - matchScore 是岗位匹配评分入口
// - 所有调用自动记录 telemetry

const { recordLLMCall } = require('../audit/llm-telemetry');

// ── 配置 ──
function getLLMConfig() {
  const apiKey = process.env.LLM_API_KEY || '';
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  return { apiKey, baseUrl, model };
}

function providerLabel(baseUrl) {
  const host = (baseUrl || '').toLowerCase();
  if (host.includes('deepseek')) return 'deepseek';
  if (host.includes('anthropic')) return 'claude';
  if (host.includes('openai')) return 'openai';
  if (host.includes('ollama')) return 'ollama';
  if (host.includes('dashscope') || host.includes('aliyun')) return 'qwen';
  if (host.includes('zhipu') || host.includes('bigmodel')) return 'glm';
  return 'custom';
}

// ── HTTP 调用 ──
async function chatCompletion(messages, options = {}) {
  const { apiKey, baseUrl, model } = getLLMConfig();
  if (!apiKey) {
    throw new Error('LLM_API_KEY 未设置 — 请在环境变量中设置 LLM_API_KEY');
  }

  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const body = {
    model: options.model || model,
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens || 512,
  };

  const t0 = Date.now();
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    // 即使调用失败也记录 telemetry
    recordLLMCall({
      provider: providerLabel(baseUrl),
      model: body.model,
      inputTokens: 0, outputTokens: 0,
      latencyMs: Date.now() - t0,
      ok: false, error: e.message,
    });
    throw new Error(`LLM API 调用失败: ${e.message}`);
  }

  const data = await response.json();
  const latencyMs = Date.now() - t0;

  if (!response.ok || data.error) {
    recordLLMCall({
      provider: providerLabel(baseUrl),
      model: body.model,
      inputTokens: 0, outputTokens: 0,
      latencyMs,
      ok: false,
      error: data.error?.message || `HTTP ${response.status}`,
    });
    throw new Error(`LLM API 错误 (${response.status}): ${data.error?.message || JSON.stringify(data)}`);
  }

  const usage = data.usage || {};
  recordLLMCall({
    provider: providerLabel(baseUrl),
    model: body.model,
    inputTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
    latencyMs,
    ok: true,
  });

  return {
    content: data.choices?.[0]?.message?.content || '',
    usage,
    model: body.model,
  };
}

// ── 招呼语生成 ──

/**
 * 生成个性化招呼语
 * @param {object} options
 * @param {string} options.userName - 用户姓名
 * @param {string} options.jobDescription - 职位描述
 * @param {string} [options.resumeContext] - 简历相关内容（RAG 召回）
 * @param {string} [options.resumeText] - 完整简历文本
 * @returns {Promise<string>} 招呼语
 */
async function generateLetter({ userName, jobDescription, resumeContext, resumeText }) {
  const systemPrompt = `你是一位专业的求职者，正在 BOSS 直聘上与招聘方沟通。
请根据职位描述和求职者的简历，生成一段礼貌、简洁、真诚的打招呼语。

要求：
1. 长度 80-300 字
2. 提及求职者的核心技能与职位的匹配点
3. 表达对职位的兴趣
4. 语气自然、不模板化
5. 只输出招呼语本身，不要任何额外说明
6. 署名用"${userName || '求职者'}"`;

  const userPrompt = [
    `职位描述：`,
    jobDescription || '（无）',
    '',
    resumeContext
      ? `简历相关内容：\n${resumeContext}`
      : resumeText
        ? `简历内容：\n${resumeText.slice(0, 2000)}`
        : '',
    '',
    '请生成打招呼语：',
  ].join('\n');

  const result = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.6, maxTokens: 400 });

  return result.content.trim();
}

// ── 岗位匹配评分 ──

/**
 * LLM 评估简历与 JD 的匹配度
 * @param {object} options
 * @param {string} options.jobDescription - 职位描述
 * @param {string} options.resumeText - 简历全文
 * @param {string[]} options.matchedKeywords - 已匹配关键词
 * @returns {Promise<{score: number, reason: string, degraded: boolean}>}
 */
async function matchScore({ jobDescription, resumeText, matchedKeywords }) {
  const { apiKey } = getLLMConfig();
  if (!apiKey) {
    return { score: 100, reason: 'LLM 未配置，跳过评分', degraded: true };
  }

  const prompt = `你是一位专业的招聘匹配分析师。请评估以下简历与职位描述的匹配程度。

## 职位描述
${jobDescription}

## 简历内容
${resumeText.slice(0, 2000)}

## 已匹配的关键词
${(matchedKeywords || []).join(', ') || '无'}

## 要求
请严格按以下格式回复，不要包含任何其他内容：
分数: [0-100的整数]
理由: [一句话说明，不超过50字]

评分标准：
- 90-100: 技能和经验高度匹配，非常适合
- 70-89: 大部分技能匹配，值得投递
- 50-69: 部分匹配，可以尝试
- 0-49: 匹配度低，不建议投递`;

  try {
    const result = await chatCompletion([
      { role: 'user', content: prompt },
    ], { temperature: 0.1, maxTokens: 200 });

    const content = result.content;
    // 兼容中英文冒号
    const scoreMatch = content.match(/分数[:：]\s*(\d+)/);
    const reasonMatch = content.match(/理由[:：]\s*(.+)/);

    if (!scoreMatch) {
      return { score: 100, reason: '评分解析失败', degraded: true };
    }

    const score = Math.min(100, Math.max(0, parseInt(scoreMatch[1])));
    const reason = reasonMatch ? reasonMatch[1].trim() : '';
    return { score, reason, degraded: false };
  } catch (e) {
    return { score: 100, reason: `评分失败（${e.message}）`, degraded: true };
  }
}

module.exports = {
  getLLMConfig,
  providerLabel,
  chatCompletion,
  generateLetter,
  matchScore,
};
