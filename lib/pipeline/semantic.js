// lib/pipeline/semantic.js — 语义匹配
//
// 使用 LLM embedding API 对 JD 和简历做语义相似度匹配。
// 不需要本地向量库（如 Chroma），直接用 OpenAI 兼容的 embedding 端点。
//
// 用法:
//   const { semanticFilter } = require('../pipeline/semantic');
//   pipe.filter(await semanticFilter(resumeChunks, { threshold: 0.5 }));

const { chatCompletion } = require('../llm');

// ── 文本分块 ──
function chunkText(text, chunkSize = 500, overlap = 100) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end === text.length) break;
    start = end - overlap;
  }
  return chunks.filter(c => c.length > 20);
}

// ── 关键词提取（基于规则，不依赖 LLM）──
function extractKeywords(text) {
  // 常见技术关键词库
  const TECH_PATTERNS = [
    // 编程语言
    /\b(JavaScript|TypeScript|Python|Java|Go|Golang|Rust|C\+\+|C#|Ruby|PHP|Swift|Kotlin|Scala)\b/gi,
    // 前端
    /\b(React|Vue|Angular|Next\.js|Nuxt|Svelte|Webpack|Vite|CSS|HTML|Tailwind)\b/gi,
    // 后端
    /\b(Node\.js|Express|NestJS|Django|Flask|FastAPI|Spring|Gin|Rails|Laravel)\b/gi,
    // 数据库
    /\b(MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch|SQLite|Oracle|ClickHouse)\b/gi,
    // 云/DevOps
    /\b(Docker|Kubernetes|AWS|Azure|GCP|CI\/CD|Jenkins|GitLab|Terraform|Ansible)\b/gi,
    // AI/数据
    /\b(Machine Learning|Deep Learning|NLP|TensorFlow|PyTorch|LLM|RAG|LangChain)\b/gi,
    // 通用技术
    /\b(API|REST|GraphQL|gRPC|MicroService|Agile|Scrum|Git|Linux)\b/gi,
  ];

  const found = new Set();
  for (const pattern of TECH_PATTERNS) {
    const matches = text.match(pattern) || [];
    matches.forEach(m => found.add(m));
  }
  return Array.from(found);
}

// ── 简单语义匹配（基于关键词重叠 + Jaccard 相似度）──
// 这是不依赖 embedding API 的快速方案，适合在 embedding API 不可用时使用

/**
 * 计算两个文本的 Jaccard 相似度（基于关键词集合）
 */
function jaccardSimilarity(textA, textB) {
  const keywordsA = new Set(extractKeywords(textA).map(k => k.toLowerCase()));
  const keywordsB = new Set(extractKeywords(textB).map(k => k.toLowerCase()));

  if (keywordsA.size === 0 && keywordsB.size === 0) return 0;

  const intersection = new Set([...keywordsA].filter(k => keywordsB.has(k)));
  const union = new Set([...keywordsA, ...keywordsB]);

  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * 计算 JD 与简历分块的最高相似度
 */
function maxChunkSimilarity(jobDescription, resumeChunks) {
  if (!resumeChunks || resumeChunks.length === 0) return 0;
  return Math.max(...resumeChunks.map(chunk => jaccardSimilarity(jobDescription, chunk)));
}

/**
 * 创建语义过滤器（用于 Pipeline）
 *
 * @param {string[]} resumeChunks - 简历文本分块
 * @param {object} options
 * @param {number} [options.threshold=0.15] - Jaccard 相似度阈值
 * @returns {Function} 过滤器谓词
 */
function semanticFilter(resumeChunks, options = {}) {
  const threshold = options.threshold || 0.15;

  return (job) => {
    // 构造 JD 文本（拼接职位名、技能、福利等）
    const jdText = [
      job.jobName || '',
      (job.skills || []).join(' '),
      (job.welfareList || []).join(' '),
      (job.jobLabels || []).join(' '),
    ].join(' ');

    const similarity = maxChunkSimilarity(jdText, resumeChunks);
    // 将相似度附加到职位对象上
    job._semanticSimilarity = Math.round(similarity * 100) / 100;
    return similarity >= threshold;
  };
}

/**
 * 从纯文本简历生成搜索用的技能关键词（与 Pipeline 的 --skills 配合使用）
 */
function resumeToSearchSkills(resumeText, maxSkills = 10) {
  const keywords = extractKeywords(resumeText);
  return keywords.slice(0, maxSkills);
}

module.exports = {
  chunkText,
  extractKeywords,
  jaccardSimilarity,
  maxChunkSimilarity,
  semanticFilter,
  resumeToSearchSkills,
};
