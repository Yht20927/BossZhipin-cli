// lib/output/export.js — 数据导出（CSV / SQLite / JSONL）
//
// 用法:
//   const { exportCSV, exportSQLite, exportJSONL } = require('./output/export');
//   exportCSV(jobList, 'jobs.csv');
//   exportSQLite(jobList, 'jobs.db', 'jobs');

const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.BOSS_LOG_DIR
  ? path.resolve(process.env.BOSS_LOG_DIR)
  : path.join(__dirname, '..', '..', 'logs');
const EXPORT_DIR = path.join(LOG_DIR, 'exports');

function ensureExportDir() {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// ── CSV 导出 ──

/**
 * CSV 值转义
 */
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * 导出职位列表为 CSV
 * @param {Array} jobs - 职位列表
 * @param {string} [filename] - 文件名（默认 auto-generated）
 * @returns {string} 文件路径
 */
function exportCSV(jobs, filename) {
  ensureExportDir();

  if (!filename) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    filename = `jobs-${ts}.csv`;
  }

  const filepath = path.join(EXPORT_DIR, filename);

  // CSV 表头
  const headers = [
    'jobName', 'salaryDesc', 'jobExperience', 'jobDegree',
    'cityName', 'areaDistrict', 'brandName', 'brandStageName',
    'brandScaleName', 'brandIndustry', 'skills', 'welfareList',
    'bossName', 'bossTitle', 'bossOnline', 'securityId',
    'encryptJobId', 'encryptBossId',
  ];

  const lines = [headers.join(',')];

  for (const job of jobs) {
    const row = headers.map(h => {
      let val = job[h];
      if (Array.isArray(val)) val = val.join('; ');
      return csvEscape(val);
    });
    lines.push(row.join(','));
  }

  fs.writeFileSync(filepath, '﻿' + lines.join('\n'), 'utf8'); // BOM for Excel
  return filepath;
}

// ── JSONL 导出 ──

/**
 * 导出为 JSONL（每行一个 JSON 对象）
 */
function exportJSONL(jobs, filename) {
  ensureExportDir();

  if (!filename) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    filename = `jobs-${ts}.jsonl`;
  }

  const filepath = path.join(EXPORT_DIR, filename);
  const lines = jobs.map(j => JSON.stringify(j)).join('\n');
  fs.writeFileSync(filepath, lines + '\n', 'utf8');
  return filepath;
}

// ── SQLite 导出 ──

/**
 * 导出为 SQLite（使用 better-sqlite3 如果可用）
 */
function exportSQLite(jobs, filename, tableName = 'jobs') {
  ensureExportDir();

  if (!filename) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    filename = `jobs-${ts}.db`;
  }

  const filepath = path.join(EXPORT_DIR, filename);

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    // better-sqlite3 未安装，回退到 JSON 格式的 SQL 文件
    return exportSQLiteFallback(jobs, filepath, tableName);
  }

  const db = new Database(filepath);
  db.pragma('journal_mode = WAL');

  // 创建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobName TEXT,
      salaryDesc TEXT,
      jobExperience TEXT,
      jobDegree TEXT,
      cityName TEXT,
      areaDistrict TEXT,
      businessDistrict TEXT,
      brandName TEXT,
      brandStageName TEXT,
      brandScaleName TEXT,
      brandIndustry TEXT,
      skills TEXT,
      welfareList TEXT,
      jobLabels TEXT,
      bossName TEXT,
      bossTitle TEXT,
      bossOnline INTEGER,
      securityId TEXT,
      encryptJobId TEXT UNIQUE,
      encryptBossId TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 批量插入
  const insert = db.prepare(`
    INSERT OR REPLACE INTO ${tableName}
    (jobName, salaryDesc, jobExperience, jobDegree, cityName, areaDistrict,
     businessDistrict, brandName, brandStageName, brandScaleName, brandIndustry,
     skills, welfareList, jobLabels, bossName, bossTitle,
     bossOnline, securityId, encryptJobId, encryptBossId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const j of items) {
      insert.run(
        j.jobName, j.salaryDesc, j.jobExperience, j.jobDegree,
        j.cityName, j.areaDistrict, j.businessDistrict,
        j.brandName, j.brandStageName, j.brandScaleName, j.brandIndustry,
        Array.isArray(j.skills) ? j.skills.join(', ') : (j.skills || ''),
        Array.isArray(j.welfareList) ? j.welfareList.join(', ') : (j.welfareList || ''),
        Array.isArray(j.jobLabels) ? j.jobLabels.join(', ') : (j.jobLabels || ''),
        j.bossName, j.bossTitle,
        j.bossOnline ? 1 : 0,
        j.securityId, j.encryptJobId, j.encryptBossId,
      );
    }
  });

  insertMany(jobs);
  db.close();

  return filepath;
}

/**
 * SQLite 导出回退方案（生成 SQL 文件，可导入任意 SQLite）
 */
function exportSQLiteFallback(jobs, filepath, tableName) {
  // 把 .db 后缀换成 .sql
  const sqlPath = filepath.replace(/\.db$/, '.sql');

  const escape = (v) => {
    if (v === null || v === undefined) return 'NULL';
    return "'" + String(v).replace(/'/g, "''") + "'";
  };

  const lines = [
    `-- BOSS CLI Job Export — ${new Date().toISOString()}`,
    `-- 用法: sqlite3 jobs.db < ${path.basename(sqlPath)}`,
    '',
    `CREATE TABLE IF NOT EXISTS ${tableName} (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  jobName TEXT, salaryDesc TEXT, jobExperience TEXT, jobDegree TEXT,`,
    `  cityName TEXT, areaDistrict TEXT, brandName TEXT, brandStageName TEXT,`,
    `  brandScaleName TEXT, brandIndustry TEXT, skills TEXT,`,
    `  bossName TEXT, bossTitle TEXT, securityId TEXT,`,
    `  encryptJobId TEXT UNIQUE, encryptBossId TEXT,`,
    `  created_at TEXT DEFAULT (datetime('now'))`,
    `);`,
    '',
  ];

  for (const j of jobs) {
    const vals = [
      escape(j.jobName), escape(j.salaryDesc), escape(j.jobExperience), escape(j.jobDegree),
      escape(j.cityName), escape(j.areaDistrict), escape(j.brandName), escape(j.brandStageName),
      escape(j.brandScaleName), escape(j.brandIndustry),
      escape(Array.isArray(j.skills) ? j.skills.join(', ') : j.skills),
      escape(j.bossName), escape(j.bossTitle),
      escape(j.securityId), escape(j.encryptJobId), escape(j.encryptBossId),
    ];
    lines.push(`INSERT OR REPLACE INTO ${tableName} (jobName,salaryDesc,jobExperience,jobDegree,cityName,areaDistrict,brandName,brandStageName,brandScaleName,brandIndustry,skills,bossName,bossTitle,securityId,encryptJobId,encryptBossId) VALUES (${vals.join(',')});`);
  }

  fs.writeFileSync(sqlPath, lines.join('\n'), 'utf8');
  return sqlPath;
}

module.exports = {
  exportCSV,
  exportJSONL,
  exportSQLite,
};
