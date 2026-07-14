// lib/commands/search.js — 搜索职位（支持管线后处理 + 批量翻页 + 匹配评分）

const { getArg, positionalArgs } = require('./helpers');
const { ExpressionBuilder } = require('../expression');
const { Pipeline } = require('../pipeline');
const { salaryAbove, excludeNegotiable, hasAnySkill, bossOnline } = require('../pipeline/filters');
const { enrichSalary } = require('../pipeline/enrich');
const { enrichMatchScore, loadProfile, parseSkillsArg } = require('../pipeline/match');
const { jitter } = require('../jitter');

/**
 * 执行单页搜索
 */
async function searchOnePage(ctx, { query, city, page, pageSize, experience, degree, salary, industry, scale, jobType }) {
  const expr = new ExpressionBuilder()
    .callObj('search', { query, city, page, pageSize, experience, degree, salary, industry, scale, jobType, scene: 1, encryptExpectId: '' })
    .then(ExpressionBuilder.TRANSFORMS.jobList)
    .build();

  return await ctx.loggedCall('search', { query, city, page, pageSize }, expr);
}

/**
 * 对结果做管线后处理
 */
function applyPipeline(result, options) {
  if (!result || !result.jobList || result.jobList.length === 0) return result;

  const pipe = new Pipeline();

  if (options.noNegotiable) pipe.filter(excludeNegotiable());
  if (options.minSalary > 0) pipe.filter(salaryAbove(options.minSalary));
  if (options.onlineOnly) pipe.filter(bossOnline());
  if (options.skills) pipe.filter(hasAnySkill(options.skills.split(',').map(s => s.trim())));
  if (options.dedup) pipe.dedup(j => j.encryptJobId || j.securityId);
  if (options.enrich) pipe.enrich(enrichSalary);

  // 匹配评分（在过滤之后、排序之前执行）
  if (options.matchPreferences) {
    pipe.enrich(enrichMatchScore(options.matchPreferences));
  }

  // 排序
  if (options.sortBy === 'match-score' && options.matchPreferences) {
    pipe.sort((a, b) => (b._match?.score || 0) - (a._match?.score || 0));
  } else if (options.sortBy === 'salary-asc') {
    const { salaryMinK } = require('../pipeline/filters');
    pipe.sort((a, b) => (salaryMinK(a) || 0) - (salaryMinK(b) || 0));
  } else if (options.sortBy === 'salary-desc') {
    const { salaryMinK } = require('../pipeline/filters');
    pipe.sort((a, b) => (salaryMinK(b) || 0) - (salaryMinK(a) || 0));
  }

  if (options.limit > 0) pipe.limit(options.limit);

  result.jobList = pipe.run(result.jobList);
  result._pipelineCount = result.jobList.length;

  // 如果有匹配评分，附加汇总统计
  if (options.matchPreferences) {
    const scored = result.jobList.filter(j => j._match);
    if (scored.length > 0) {
      result._matchSummary = {
        profileUsed: options.matchSource || 'cli-args',
        totalScored: scored.length,
        gradeDistribution: {},
        avgScore: 0,
        topMatch: null,
      };
      let totalScore = 0;
      for (const j of scored) {
        const g = j._match?.grade || '?';
        result._matchSummary.gradeDistribution[g] = (result._matchSummary.gradeDistribution[g] || 0) + 1;
        totalScore += j._match?.score || 0;
        if (!result._matchSummary.topMatch || (j._match?.score || 0) > (result._matchSummary.topMatch._match?.score || 0)) {
          result._matchSummary.topMatch = j;
        }
      }
      result._matchSummary.avgScore = Math.round(totalScore / scored.length);
    }
  }

  return result;
}

async function search(ctx, args) {
  const city = getArg(args, 'city', '100010000');
  const page = parseInt(getArg(args, 'page', '1'));
  const pageSize = parseInt(getArg(args, 'pageSize', '15'));
  const experience = getArg(args, 'experience', '');
  const degree = getArg(args, 'degree', '');
  const salary = getArg(args, 'salary', '');
  const industry = getArg(args, 'industry', '');
  const scale = getArg(args, 'scale', '');
  const jobType = getArg(args, 'jobType', '');
  const query = positionalArgs(args).join(' ') || '';

  // 管线参数
  const minSalary = parseInt(getArg(args, 'min-salary', '0'));
  const limit = parseInt(getArg(args, 'limit', '0'));
  const sortBy = getArg(args, 'sort', '');
  const skills = getArg(args, 'skills', '');
  const enrich = args.includes('--enrich');
  const dedup = args.includes('--dedup');
  const onlineOnly = args.includes('--online');
  const noNegotiable = args.includes('--no-negotiable');

  // 批量翻页参数
  const pages = parseInt(getArg(args, 'pages', '1'));
  const pageInterval = parseFloat(getArg(args, 'interval', '2.0'));

  // 匹配评分参数
  const matchProfile = getArg(args, 'match-profile', '');
  const matchSkills = getArg(args, 'match-skills', '');
  const matchMinSalary = parseInt(getArg(args, 'match-min-salary', '0'));
  const matchCities = getArg(args, 'match-cities', '');
  const matchSort = args.includes('--match-sort');

  // 导出参数
  const saveFormat = getArg(args, 'save', '');  // csv | jsonl | sqlite | db
  const noCache = args.includes('--no-cache');

  const searchParams = { query, city, pageSize, experience, degree, salary, industry, scale, jobType };
  const pipelineOpts = { minSalary, limit, sortBy, skills, enrich, dedup, onlineOnly, noNegotiable };

  // 构建匹配偏好
  if (matchProfile || matchSkills || matchMinSalary > 0 || matchCities) {
    let preferences = {};
    if (matchProfile) {
      try {
        preferences = loadProfile(matchProfile);
        pipelineOpts.matchSource = matchProfile;
      } catch (e) {
        console.error(`[search] 加载偏好配置失败: ${e.message}，使用命令行参数`);
      }
    }
    // 命令行参数可覆盖配置文件
    if (matchSkills) {
      preferences.skills = parseSkillsArg(matchSkills);
      if (!pipelineOpts.matchSource) pipelineOpts.matchSource = '--match-skills';
    }
    if (matchMinSalary > 0) {
      preferences.minSalary = matchMinSalary;
    }
    if (matchCities) {
      preferences.preferredCities = matchCities.split(',').map(s => s.trim());
    }
    pipelineOpts.matchPreferences = preferences;
    // 默认按匹配度排序
    if (!sortBy || matchSort) pipelineOpts.sortBy = 'match-score';
  }

  if (pages <= 1) {
    // 单页搜索（原有逻辑）
    const result = await searchOnePage(ctx, { ...searchParams, page });
    const processed = applyPipeline(result, pipelineOpts);
    // 导出（如果指定了 --save）
    if (saveFormat && processed && processed.jobList && processed.jobList.length > 0) {
      saveResults(processed.jobList, saveFormat, query);
    }
    // 自动缓存 + slim 输出
    if (!noCache && processed && processed.jobList && processed.jobList.length > 0) {
      return autoCache(ctx, 'search', searchParams, processed);
    }
    return processed;
  }

  // ── 批量翻页搜索 ──
  const allJobs = [];
  let totalResCount = 0;
  let lastHasMore = false;
  let lastLid = '';
  const seen = new Set();
  const failedPages = [];

  for (let p = page; p < page + pages; p++) {
    if (p > page) {
      // 页间抖动间隔：基础值 × (1 ± 30%)，防风控
      const delay = jitter(pageInterval * 1000, 0.3);
      console.error(`[search] 等待 ${Math.round(delay / 1000)}s 后翻下一页...`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const result = await searchOnePage(ctx, { ...searchParams, page: p });
      if (!result || !result.jobList) {
        failedPages.push({ page: p, error: '无数据' });
        break;
      }

      const jobs = result.jobList;
      totalResCount = result.resCount || totalResCount;
      lastHasMore = result.hasMore;
      if (result.lid) lastLid = result.lid;

      // 页间去重（按 encryptJobId）
      let added = 0;
      for (const job of jobs) {
        const key = job.encryptJobId || job.securityId;
        if (key && !seen.has(key)) {
          seen.add(key);
          allJobs.push(job);
          added++;
        }
      }
      console.error(`[search] 第 ${p} 页: ${jobs.length} 条 (新增 ${added}, 累计 ${allJobs.length})`);

      if (!result.hasMore || jobs.length === 0) {
        console.error(`[search] 第 ${p} 页已无更多结果，停止翻页`);
        break;
      }
    } catch (e) {
      failedPages.push({ page: p, error: e.message });
      console.error(`[search] 第 ${p} 页失败: ${e.message}`);
      // 单页失败不中断，继续翻下一页
    }
  }

  const mergedResult = {
    resCount: totalResCount,
    hasMore: lastHasMore,
    lid: lastLid,
    jobList: allJobs,
    _pagesRequested: pages,
    _pagesCompleted: pages - failedPages.length,
    _failedPages: failedPages.length > 0 ? failedPages : undefined,
  };

  // 统一管线后处理（在整个合并结果上执行一次）
  const processed = applyPipeline(mergedResult, pipelineOpts);

  // 导出（如果指定了 --save）
  if (saveFormat && processed && processed.jobList && processed.jobList.length > 0) {
    saveResults(processed.jobList, saveFormat, query);
  }

  // 自动缓存 + slim 输出
  if (!noCache && processed && processed.jobList && processed.jobList.length > 0) {
    return autoCache(ctx, 'search', searchParams, processed);
  }

  return processed;
}

// ── 自动缓存 ──

function autoCache(ctx, endpoint, params, result) {
  try {
    const invId = ctx.cache.createInvocation(endpoint, params);
    ctx.cache.store(invId, result.jobList, {
      topLevel: {
        resCount: result.resCount,
        hasMore: result.hasMore,
        lid: result.lid,
      },
    });
    const slim = ctx.cache.slimOutput(invId, result);
    // 保留管线元信息和匹配汇总
    if (result._pipelineCount !== undefined) slim._pipelineCount = result._pipelineCount;
    if (result._pagesRequested) slim._pagesRequested = result._pagesRequested;
    if (result._pagesCompleted) slim._pagesCompleted = result._pagesCompleted;
    if (result._matchSummary) slim._matchSummary = result._matchSummary;
    return slim;
  } catch (e) {
    console.error(`[search] 缓存失败: ${e.message}，回退原始输出`);
    return result;
  }
}

// ── 导出辅助 ──

function saveResults(jobList, format, query) {
  try {
    const { exportCSV, exportJSONL, exportSQLite } = require('../output/export');
    const prefix = query ? query.replace(/[<>:"/\\|?*\s]/g, '_').substring(0, 20) : 'jobs';

    let filepath;
    switch (format.toLowerCase()) {
      case 'csv':
        filepath = exportCSV(jobList, `${prefix}-${Date.now().toString(36)}.csv`);
        console.error(`[search] CSV 已导出: ${filepath}`);
        break;
      case 'jsonl':
        filepath = exportJSONL(jobList, `${prefix}-${Date.now().toString(36)}.jsonl`);
        console.error(`[search] JSONL 已导出: ${filepath}`);
        break;
      case 'sqlite':
      case 'db':
        filepath = exportSQLite(jobList, `${prefix}-${Date.now().toString(36)}.db`);
        console.error(`[search] SQLite 已导出: ${filepath}`);
        break;
      default:
        console.error(`[search] 不支持的导出格式: ${format}，支持 csv/jsonl/sqlite`);
    }
  } catch (e) {
    console.error(`[search] 导出失败: ${e.message}`);
  }
}

module.exports = { search };
