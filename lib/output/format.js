// lib/output/format.js — 输出格式化器
//
// 提供多种输出格式：json, table, csv, summary
// 用法: formatOutput(data, 'table', { fields: ['jobName', 'salaryDesc'] })

/**
 * 格式化输出数据
 * @param {*} data - 要格式化的数据
 * @param {string} format - 'json' | 'table' | 'csv' | 'summary' | 'raw'
 * @param {object} options
 * @param {string[]} [options.fields] - 要输出的字段列表
 * @param {boolean} [options.color] - 是否启用颜色（默认 auto-detect TTY）
 */
function formatOutput(data, format = 'json', options = {}) {
  switch (format) {
    case 'json':  return formatJSON(data);
    case 'table': return formatTable(data, options);
    case 'csv':   return formatCSV(data, options);
    case 'summary': return formatSummary(data, options);
    case 'raw':   return data;
    default:      return formatJSON(data);
  }
}

// ── JSON ──

function formatJSON(data) {
  return JSON.stringify(data, null, 2);
}

// ── Table ──

function formatTable(data, options = {}) {
  const list = data.jobList || (Array.isArray(data) ? data : [data]);
  if (!Array.isArray(list) || list.length === 0) return '(no results)';

  const fields = options.fields || defaultFields(list[0]);
  const color = options.color !== undefined ? options.color : process.stdout.isTTY;

  // 计算列宽
  const widths = {};
  for (const f of fields) {
    widths[f] = Math.max(
      f.length,
      ...list.map(item => String(item[f] || '').length)
    );
  }

  // 构建表格
  const lines = [];

  // 表头
  const header = fields.map(f => pad(String(f), widths[f])).join(' | ');
  lines.push(header);
  lines.push(fields.map(f => '-'.repeat(widths[f])).join('-+-'));

  // 数据行
  for (const item of list) {
    const row = fields.map(f => pad(String(item[f] || ''), widths[f])).join(' | ');
    lines.push(row);
  }

  lines.push(`\n(${list.length} results)`);
  return lines.join('\n');
}

/** 根据数据类型推断默认输出字段 */
function defaultFields(item) {
  if (item.jobName) return ['jobName', 'salaryDesc', 'cityName', 'brandName', 'brandScaleName', 'jobExperience'];
  if (item.name && item.title) return ['name', 'title', 'brandName', 'jobName', 'unreadMsgCount'];
  if (item.msgContent || item.showText) return ['msgTime', 'showText'];
  return Object.keys(item).slice(0, 6);
}

/** 填充字符串到指定宽度 */
function pad(str, width) {
  // 简单处理 CJK 字符（每个中文约占 2 个英文字符宽度）
  const len = [...str].reduce((acc, c) => {
    const code = c.codePointAt(0);
    return acc + (code > 0x4e00 ? 2 : 1);
  }, 0);
  return str + ' '.repeat(Math.max(0, width - len));
}

// ── CSV ──

function formatCSV(data, options = {}) {
  const list = data.jobList || (Array.isArray(data) ? data : [data]);
  if (!Array.isArray(list) || list.length === 0) return '';

  const fields = options.fields || defaultFields(list[0]);
  const header = fields.map(csvEscape).join(',');
  const rows = list.map(item =>
    fields.map(f => csvEscape(String(item[f] !== undefined ? item[f] : ''))).join(',')
  );

  return [header, ...rows].join('\n');
}

function csvEscape(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ── Summary ──

function formatSummary(data, options = {}) {
  const list = data.jobList || (Array.isArray(data) ? data : [data]);
  if (!Array.isArray(list) || list.length === 0) return '(no data)';

  const lines = [];
  lines.push(`Total: ${list.length} items`);

  // 薪资分布
  const salaryBuckets = { '10K-': 0, '10-20K': 0, '20-35K': 0, '35K+': 0, 'Negotiable': 0 };
  for (const item of list) {
    const s = item.salaryDesc || '';
    if (s === '面议' || !s) { salaryBuckets['Negotiable']++; continue; }
    const m = s.match(/([\d.]+)\s*[Kk]/);
    if (!m) { salaryBuckets['Negotiable']++; continue; }
    const minK = parseFloat(m[1]);
    if (minK < 10) salaryBuckets['10K-']++;
    else if (minK < 20) salaryBuckets['10-20K']++;
    else if (minK < 35) salaryBuckets['20-35K']++;
    else salaryBuckets['35K+']++;
  }

  lines.push('\nSalary Distribution:');
  const maxCount = Math.max(...Object.values(salaryBuckets), 1);
  for (const [label, count] of Object.entries(salaryBuckets)) {
    const bar = '█'.repeat(Math.round(count / maxCount * 30));
    const pct = Math.round(count / list.length * 100);
    lines.push(`  ${label.padEnd(12)} ${bar} ${pct}%`);
  }

  // 城市分布 Top 5
  const cities = {};
  for (const item of list) {
    const c = item.cityName || 'Unknown';
    cities[c] = (cities[c] || 0) + 1;
  }
  const topCities = Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topCities.length > 0) {
    lines.push('\nTop Cities:');
    for (const [city, count] of topCities) {
      lines.push(`  ${city.padEnd(12)} ${count}`);
    }
  }

  return lines.join('\n');
}

module.exports = { formatOutput };
