// lib/pipeline/filters.js — 预置过滤器
//
// 每个过滤器返回一个可用于 Array.filter() 的谓词函数。
// 也可用于 Pipeline.filter()。

/**
 * 解析 salaryDesc 中的最低月薪（K 为单位）。
 * "15K-25K" → 15, "面议" → null
 */
function salaryMinK(job) {
  const s = job.salaryDesc || '';
  const m = s.match(/([\d.]+)\s*[Kk]/);
  return m ? parseFloat(m[1]) : null;
}

/**
 * 解析 salaryDesc 中的最高月薪（K 为单位）。
 */
function salaryMaxK(job) {
  const s = job.salaryDesc || '';
  const m = s.match(/-\s*([\d.]+)\s*[Kk]/);
  return m ? parseFloat(m[1]) : null;
}

// ── 薪资过滤 ──

/** 最低月薪 >= minK */
function salaryAbove(minK) {
  return j => {
    const min = salaryMinK(j);
    return min !== null && min >= minK;
  };
}

/** 月薪区间 [minK, maxK] */
function salaryRange(minK, maxK) {
  return j => {
    const min = salaryMinK(j);
    const max = salaryMaxK(j);
    if (min === null) return false;
    if (max !== null && max < minK) return false;
    return min <= maxK;
  };
}

/** 排除「面议」 */
function excludeNegotiable() {
  return j => salaryMinK(j) !== null;
}

// ── 技能过滤 ──

/** 要求具备列表中任一技能 */
function hasAnySkill(skills) {
  const lower = skills.map(s => s.toLowerCase());
  return j => {
    const jobSkills = (j.skills || []).map(s => (s || '').toLowerCase());
    return lower.some(s => jobSkills.some(js => js.includes(s) || s.includes(js)));
  };
}

/** 要求具备列表中所有技能 */
function hasAllSkills(skills) {
  const lower = skills.map(s => s.toLowerCase());
  return j => {
    const jobSkills = (j.skills || []).map(s => (s || '').toLowerCase());
    return lower.every(s => jobSkills.some(js => js.includes(s) || s.includes(js)));
  };
}

/** 排除包含指定技能 */
function excludeSkills(skills) {
  const lower = skills.map(s => s.toLowerCase());
  return j => {
    const jobSkills = (j.skills || []).map(s => (s || '').toLowerCase());
    return !lower.some(s => jobSkills.some(js => js.includes(s) || s.includes(js)));
  };
}

// ── 城市/地点过滤 ──

/** 限定城市（模糊匹配 cityName） */
function cityIn(cities) {
  const lower = cities.map(c => c.toLowerCase());
  return j => lower.some(c => (j.cityName || '').toLowerCase().includes(c));
}

// ── 公司过滤 ──

/** 排除黑名单公司（模糊匹配 brandName） */
function companyNotBlacklist(blacklist) {
  const lower = blacklist.map(b => b.toLowerCase());
  return j => !lower.some(b => (j.brandName || '').toLowerCase().includes(b));
}

/** 只看指定规模的公司 */
function companyScaleIn(scales) {
  return j => scales.some(s => (j.brandScaleName || '').includes(s));
}

// ── 状态过滤 ──

/** 只看 HR 在线 */
function bossOnline() {
  return j => j.bossOnline === true || j.bossOnline === 1;
}

/** 只看有效职位 */
function validJobs() {
  return j => j.jobValidStatus !== 0 && j.jobValidStatus !== 3;
}

// ── 福利过滤 ──

/** 福利中包含关键词 */
function hasWelfare(keyword) {
  const kw = keyword.toLowerCase();
  return j => (j.welfareList || []).some(w => (w || '').toLowerCase().includes(kw));
}

module.exports = {
  salaryMinK,
  salaryMaxK,
  salaryAbove,
  salaryRange,
  excludeNegotiable,
  hasAnySkill,
  hasAllSkills,
  excludeSkills,
  cityIn,
  companyNotBlacklist,
  companyScaleIn,
  bossOnline,
  validJobs,
  hasWelfare,
};
