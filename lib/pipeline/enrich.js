// lib/pipeline/enrich.js — 数据富化
//
// 对职位数据进行增强：薪资解析、公司分类、评分、去重

const { salaryMinK, salaryMaxK } = require('./filters');

/**
 * 解析 salaryDesc 为结构化薪资对象。
 * "15K-25K" → { min: 15000, max: 25000, avg: 20000, currency: 'CNY', period: 'month' }
 * "15K-25K·13薪" → { min: 15000, max: 25000, avg: 20000, months: 13, annual: {...} }
 * "面议" → { negotiable: true }
 */
function parseSalary(salaryDesc) {
  if (!salaryDesc || salaryDesc === '面议') {
    return { negotiable: true, raw: salaryDesc || '面议' };
  }

  const monthsMatch = salaryDesc.match(/·(\d+)薪/);
  const months = monthsMatch ? parseInt(monthsMatch[1]) : 12;

  // 匹配 "15K-25K" 格式
  const kRange = salaryDesc.match(/([\d.]+)\s*[Kk]\s*-\s*([\d.]+)\s*[Kk]/);
  if (kRange) {
    const min = parseFloat(kRange[1]) * 1000;
    const max = parseFloat(kRange[2]) * 1000;
    return {
      min, max,
      avg: Math.round((min + max) / 2),
      currency: 'CNY',
      period: 'month',
      months,
      annual: { min: min * months, max: max * months, avg: Math.round((min + max) / 2 * months) },
      raw: salaryDesc,
    };
  }

  // 匹配 "1.5万-3万" 格式
  const wanRange = salaryDesc.match(/([\d.]+)\s*万\s*-\s*([\d.]+)\s*万/);
  if (wanRange) {
    const min = parseFloat(wanRange[1]) * 10000;
    const max = parseFloat(wanRange[2]) * 10000;
    return {
      min, max,
      avg: Math.round((min + max) / 2),
      currency: 'CNY',
      period: 'month',
      months,
      annual: { min: min * months, max: max * months, avg: Math.round((min + max) / 2 * months) },
      raw: salaryDesc,
    };
  }

  return { raw: salaryDesc, parsed: false };
}

/**
 * 为职位添加薪资结构化字段（_salary）。
 * 用于 Pipeline.enrich()
 */
function enrichSalary(job) {
  job._salary = parseSalary(job.salaryDesc);
  return job;
}

/**
 * 基于用户偏好为职位打分。
 * preferences: { skills: string[], minSalary: number, preferredCities: string[], preferredScales: string[] }
 * 得分越高越匹配。
 */
function scoreJob(job, preferences = {}) {
  let score = 0;

  // 技能匹配（最高 40 分）
  if (preferences.skills && preferences.skills.length > 0) {
    const jobSkills = (job.skills || []).map(s => (s || '').toLowerCase());
    const matched = preferences.skills.filter(s =>
      jobSkills.some(js => js.includes(s.toLowerCase()) || s.toLowerCase().includes(js))
    );
    score += Math.round((matched.length / preferences.skills.length) * 40);
  }

  // 薪资匹配（最高 30 分）
  if (preferences.minSalary) {
    const min = salaryMinK(job);
    if (min !== null) {
      const ratio = Math.min(min / preferences.minSalary, 2);
      score += Math.round(ratio * 15);
    }
  }

  // 城市匹配（最高 20 分）
  if (preferences.preferredCities && preferences.preferredCities.length > 0) {
    const cityName = (job.cityName || '').toLowerCase();
    if (preferences.preferredCities.some(c => cityName.includes(c.toLowerCase()))) {
      score += 20;
    }
  }

  // 公司规模匹配（最高 10 分）
  if (preferences.preferredScales && preferences.preferredScales.length > 0) {
    const scale = job.brandScaleName || '';
    if (preferences.preferredScales.some(s => scale.includes(s))) {
      score += 10;
    }
  }

  job._score = score;
  return job;
}

module.exports = {
  parseSalary,
  enrichSalary,
  scoreJob,
};
