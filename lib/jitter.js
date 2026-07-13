// lib/jitter.js — 操作节奏随机延迟工具库
// 为自动化操作注入符合人类操作节奏的随机延迟，作为账号保护措施降低账号被限流的风险
// （非规避平台检测或伪装真人，详见 DISCLAIMER §7）。
//
// 设计原则：
// - 延迟范围基于真实人类操作数据（阅读速度、打字速度、注意力切换时间）
// - 支持概率触发（模拟偶尔走神或被打断）
// - 提供抖动函数给固定值添加随机性

/**
 * 基础 sleep
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, Math.max(0, ms)));
}

/**
 * 在 [min, max] 区间内随机睡眠
 * @param {number} minMs
 * @param {number} maxMs
 * @returns {Promise<void>}
 */
async function randomSleep(minMs, maxMs) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return sleep(ms);
}

/**
 * 以 probability 概率触发延迟（模拟偶尔走神/停顿）
 * @param {number} probability 0-1
 * @param {number} minMs
 * @param {number} maxMs
 * @returns {Promise<void>}
 */
async function maybeDelay(probability, minMs, maxMs) {
  if (Math.random() < probability) {
    await randomSleep(minMs, maxMs);
  }
}

/**
 * 偶尔触发超长停顿（模拟被打断/走神/切换App）
 * @param {number} probability 触发概率 0-1（默认 0.05）
 * @param {number} minMs 最小毫秒（默认 60000）
 * @param {number} maxMs 最大毫秒（默认 180000）
 * @returns {Promise<boolean>} 是否触发了长停顿
 */
async function occasionalLongPause(probability = 0.05, minMs = 60000, maxMs = 180000) {
  if (Math.random() < probability) {
    const ms = minMs + Math.random() * (maxMs - minMs);
    const sec = Math.round(ms / 1000);
    if (process.env.XHS_DEBUG) console.warn('[jitter] occasionalLongPause: ' + sec + 's');
    await sleep(ms);
    return true;
  }
  return false;
}

/**
 * 在基础值上添加百分比抖动
 * @param {number} baseMs
 * @param {number} percent 0-1
 * @returns {number}
 */
function jitter(baseMs, percent) {
  const delta = baseMs * percent;
  return baseMs + (Math.random() * 2 - 1) * delta;
}

/**
 * 人类行为延迟预设场景
 * 基于真实人类在社交媒体上的操作节奏：
 * - 翻页/滚动：0.8-2.5s（手眼协调 + 找按钮）
 * - 阅读评论：3-12s（平均阅读速度 300-500 字/分钟，评论通常 20-80 字）
 * - 思考回复：5-20s（理解内容 + 组织语言 + 打字前思考）
 * - 发布间隔：45-180s（人工操作不可能每秒都在回复）
 * - 浏览空闲：1-5s（随机停顿、滚动、看图片）
 * - 打字间隔：0.3-1.5s（逐字输入，偶尔回删）
 *
 * @param {string} type
 * @returns {Promise<void>}
 */
async function humanDelay(type) {
  return sleep(humanDelayMs(type));
}

/**
 * 获取某类延迟的随机毫秒数（不 sleep，仅返回数值）
 * 用于需要计算而不是直接 sleep 的场景
 * @param {string} type
 * @returns {number}
 */
function humanDelayMs(type) {
  const ranges = {
    page_turn: [800, 2500],
    read_comment: [3000, 12000],
    think_reply: [5000, 20000],
    post_interval: [45000, 180000],
    browse_idle: [1000, 5000],
    type_char: [300, 1500],
    scroll: [300, 1200],
    switch_tab: [2000, 8000],
  };
  const [min, max] = ranges[type] || [1000, 3000];
  return min + Math.random() * (max - min);
}

/**
 * 模拟人类打字过程（逐字输出，带随机延迟）
 * 用于日志输出或模拟输入场景
 * @param {string} text
 * @param {function} onChar 每输出一个字符的回调
 */
async function typeLikeHuman(text, onChar) {
  for (const ch of String(text)) {
    await humanDelay('type_char');
    if (onChar) onChar(ch);
  }
}

module.exports = {
  sleep,
  randomSleep,
  maybeDelay,
  occasionalLongPause,
  jitter,
  humanDelay,
  humanDelayMs,
  typeLikeHuman,
};
