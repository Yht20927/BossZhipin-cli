// lib/pipeline/match.js — 岗位匹配评分
//
// 多维度评分：技能(40%) + 薪资(30%) + 城市(20%) + 公司(10%)
// 评分结果附在 job._matchScore 和 job._matchDetail 字段
// 支持从 JSON 配置文件读取偏好，也可通过命令行参数传入

const fs = require('fs');
const path = require('path');
const { salaryMinK } = require('./filters');

// ── 默认偏好配置 ──
const DEFAULT_PREFERENCES = {
  skills: [],
  minSalary: 0,
  maxSalary: Infinity,
  preferredCities: [],
  preferredScales: [],
  preferredIndustries: [],
  preferredStages: [],
  excludeCompanies: [],
  excludeSkills: [],
};

/**
 * 从 JSON 文件加载偏好配置。
 * 文件格式:
 * {
 *   "skills": ["JavaScript", "Node.js", "React"],
 *   "minSalary": 15,
 *   "preferredCities": ["北京", "上海"],
 *   "preferredScales": ["500-999人", "1000-9999人"],
 *   "preferredIndustries": ["互联网", "人工智能"],
 *   "preferredStages": ["C轮", "D轮及以上", "上市公司"],
 *   "excludeCompanies": ["外包", "外派"],
 *   "excludeSkills": ["PHP", "jQuery"]
 * }
 */
function loadProfile(profilePath) {
  const resolved = path.resolve(profilePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`偏好配置文件不存在: ${resolved}`);
  }
  const data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return { ...DEFAULT_PREFERENCES, ...data };
}

/**
 * 解析命令行传入的技能列表（逗号分隔）
 */
function parseSkillsArg(skillsStr) {
  if (!skillsStr) return [];
  return skillsStr.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * 技能匹配度评分 (0-40)
 * @param {object} job - 职位对象
 * @param {string[]} preferredSkills - 期望技能列表
 * @param {string[]} excludeSkills - 排除技能列表
 */
function scoreSkills(job, preferredSkills, excludeSkills = []) {
  if (!preferredSkills || preferredSkills.length === 0) return { score: 0, detail: '未配置技能偏好', max: 40 };

  const jobSkills = (job.skills || []).map(s => (s || '').toLowerCase());
  const jobName = (job.jobName || '').toLowerCase();
  const allText = jobSkills.join(' ') + ' ' + jobName;

  const lowerPref = preferredSkills.map(s => s.toLowerCase());
  const lowerExclude = excludeSkills.map(s => s.toLowerCase());

  // 排除技能检查：命中即大幅扣分
  const excludedHits = lowerExclude.filter(s => allText.includes(s));
  const penalty = excludedHits.length * 10;

  // 技能匹配
  const matches = lowerPref.filter(s => allText.includes(s));
  const rawScore = preferredSkills.length > 0
    ? Math.round((matches.length / preferredSkills.length) * 40)
    : 0;

  return {
    score: Math.max(0, rawScore - penalty),
    detail: matches.length > 0 ? `命中: ${matches.join(', ')}` : '无技能匹配',
    matches,
    excludedHits,
    max: 40,
  };
}

/**
 * 薪资匹配度评分 (0-30)
 * @param {object} job
 * @param {number} minSalary - 期望最低月薪(K)
 */
function scoreSalary(job, minSalary) {
  if (!minSalary || minSalary <= 0) return { score: 0, detail: '未配置期望薪资', max: 30 };

  const min = salaryMinK(job);
  if (min === null) return { score: 5, detail: '薪资面议', max: 30 };

  // 达到期望给满分，每差 1K 扣 2 分
  const diff = min - minSalary;
  if (diff >= 5) return { score: 30, detail: `月薪 ${min}K ≥ 期望 ${minSalary}K (超出${diff}K)`, max: 30 };
  if (diff >= 0) return { score: 28, detail: `月薪 ${min}K ≥ 期望 ${minSalary}K`, max: 30 };
  if (diff >= -3) return { score: 22, detail: `月薪 ${min}K 略低于期望 ${minSalary}K`, max: 30 };
  if (diff >= -5) return { score: 15, detail: `月薪 ${min}K 低于期望 ${minSalary}K`, max: 30 };
  return { score: Math.max(0, 10 + diff), detail: `月薪 ${min}K 远低于期望 ${minSalary}K`, max: 30 };
}

/**
 * 城市匹配度评分 (0-20)
 * @param {object} job
 * @param {string[]} preferredCities
 */
function scoreCity(job, preferredCities) {
  if (!preferredCities || preferredCities.length === 0) return { score: 0, detail: '未配置城市偏好', max: 20 };

  const city = (job.cityName || '').toLowerCase();
  const district = (job.areaDistrict || '').toLowerCase();
  const biz = (job.businessDistrict || '').toLowerCase();

  for (const pref of preferredCities) {
    const p = pref.toLowerCase();
    if (city.includes(p)) return { score: 20, detail: `城市匹配: ${job.cityName}`, max: 20 };
    if (district.includes(p) || biz.includes(p)) return { score: 15, detail: `城区匹配: ${district || biz}`, max: 20 };
  }
  return { score: 0, detail: `城市不匹配: ${job.cityName}`, max: 20 };
}

/**
 * 公司匹配度评分 (0-10)
 * @param {object} job
 * @param {object} prefs - 含 preferredScales, preferredIndustries, preferredStages, excludeCompanies
 */
function scoreCompany(job, prefs) {
  const preferredScales = prefs.preferredScales || [];
  const preferredIndustries = prefs.preferredIndustries || [];
  const preferredStages = prefs.preferredStages || [];
  const excludeCompanies = prefs.excludeCompanies || [];

  if (!preferredScales.length && !preferredIndustries.length && !preferredStages.length) {
    return { score: 0, detail: '未配置公司偏好', max: 10 };
  }

  let score = 0;
  const reasons = [];

  // 黑名单检查
  const brandLower = (job.brandName || '').toLowerCase();
  const industryLower = (job.brandIndustry || '').toLowerCase();
  for (const ex of excludeCompanies) {
    const e = ex.toLowerCase();
    if (brandLower.includes(e) || industryLower.includes(e)) {
      return { score: -50, detail: `触发黑名单: ${ex}`, max: 10, blacklisted: true };
    }
  }

  // 规模匹配 (0-4)
  const scale = job.brandScaleName || '';
  if (preferredScales.length > 0) {
    const match = preferredScales.some(s => scale.includes(s));
    if (match) { score += 4; reasons.push(`规模: ${scale}`); }
  }

  // 行业匹配 (0-3)
  const industry = job.brandIndustry || '';
  if (preferredIndustries.length > 0) {
    const match = preferredIndustries.some(s => industry.includes(s));
    if (match) { score += 3; reasons.push(`行业: ${industry}`); }
  }

  // 阶段匹配 (0-3)
  const stage = job.brandStageName || '';
  if (preferredStages.length > 0) {
    const match = preferredStages.some(s => stage.includes(s));
    if (match) { score += 3; reasons.push(`阶段: ${stage}`); }
  }

  return {
    score,
    detail: reasons.length > 0 ? reasons.join(', ') : '公司偏好不匹配',
    max: 10,
  };
}

/**
 * 综合匹配评分
 * 返回 { score: 0-100, ...dimensions }
 *
 * @param {object} job - 职位对象
 * @param {object} preferences - 偏好配置
 * @returns {object} 评分详情
 */
function matchScore(job, preferences = {}) {
  const prefs = { ...DEFAULT_PREFERENCES, ...preferences };

  const skills = scoreSkills(job, prefs.skills, prefs.excludeSkills);
  const salary = scoreSalary(job, prefs.minSalary);
  const city = scoreCity(job, prefs.preferredCities);
  const company = scoreCompany(job, prefs);

  // 黑名单直接给负分
  if (company.blacklisted) {
    return {
      score: -1,
      blacklisted: true,
      reason: company.detail,
      dimensions: { skills, salary, city, company },
    };
  }

  // 总分 = 各项得分之和
  const total = skills.score + salary.score + city.score + company.score;

  // 等级划分
  let grade;
  if (total >= 80) grade = 'S';
  else if (total >= 65) grade = 'A';
  else if (total >= 50) grade = 'B';
  else if (total >= 35) grade = 'C';
  else grade = 'D';

  return {
    score: total,
    grade,
    dimensions: { skills, salary, city, company },
    summary: [
      skills.detail,
      salary.detail,
      city.detail,
      company.detail,
    ].filter(Boolean).join(' | '),
  };
}

/**
 * Pipeline enrich 函数：对每个职位打分并附加 _match 字段。
 * 用法: pipe.enrich(enrichMatchScore(preferences))
 */
function enrichMatchScore(preferences) {
  return (job) => {
    const result = matchScore(job, preferences);
    job._match = result;
    return job;
  };
}

module.exports = {
  loadProfile,
  parseSkillsArg,
  matchScore,
  enrichMatchScore,
  scoreSkills,
  scoreSalary,
  scoreCity,
  scoreCompany,
  DEFAULT_PREFERENCES,
};
