// lib/commands/greet-batch.js — 批量打招呼
//
// 流程: search → 管线过滤 → 逐一发送沟通请求
// 利用 server.js 内置的写操作节流 (~47.5s) 保证安全间隔

const { getArg, positionalArgs, isRef } = require('./helpers');
const { ExpressionBuilder } = require('../expression');
const { Pipeline } = require('../pipeline');
const {
  salaryAbove, excludeNegotiable, hasAnySkill, bossOnline,
  companyNotBlacklist, cityIn, hasWelfare, validJobs,
} = require('../pipeline/filters');
const { jitter } = require('../jitter');

async function greetBatch(ctx, args) {
  // ── 搜索参数 ──
  const city = getArg(args, 'city', '100010000');
  const pageSize = parseInt(getArg(args, 'pageSize', '15'));
  const experience = getArg(args, 'experience', '');
  const degree = getArg(args, 'degree', '');
  const salary = getArg(args, 'salary', '');
  const industry = getArg(args, 'industry', '');
  const scale = getArg(args, 'scale', '');
  const jobType = getArg(args, 'jobType', '');
  const query = positionalArgs(args).join(' ') || '';

  // ── 批量控制 ──
  const count = parseInt(getArg(args, 'count', '5'));
  const minSalary = parseInt(getArg(args, 'min-salary', '0'));
  const intervalSec = parseFloat(getArg(args, 'interval', '50'));
  const dryRun = args.includes('--dry-run');
  const skills = getArg(args, 'skills', '');
  const exclude = getArg(args, 'exclude', '');
  const onlineOnly = args.includes('--online');
  const noNegotiable = args.includes('--no-negotiable');
  const sortBy = getArg(args, 'sort', 'salary-desc');

  // ── 简历路径（用于未来 LLM 招呼语，Phase 2）──
  const resumePath = getArg(args, 'resume', '');
  const refsArg = getArg(args, 'refs', '');

  // ── --refs 模式：直接从缓存解析 ──
  if (refsArg) {
    if (query) {
      console.error(`[greet-batch] ⚠️ 同时提供了 query 和 --refs，--refs 优先，query 被忽略`);
    }
    const refs = refsArg.split(',').map(s => s.trim()).filter(Boolean);
    const candidates = [];
    for (const ref of refs) {
      const record = ctx.cache.resolve(ref);
      if (!record) {
        console.error(`[greet-batch] 缓存未命中，跳过: ${ref}`);
        continue;
      }
      candidates.push(record);
    }

    if (candidates.length === 0) {
      return { ok: false, error: '所有引用均未命中缓存' };
    }

    console.error(`[greet-batch] 从缓存解析 ${candidates.length} 个候选`);

    // ── 预览模式 ──
    if (dryRun) {
      const preview = candidates.map((j, i) => ({
        index: i + 1,
        jobName: j.jobName,
        brandName: j.brandName,
        salaryDesc: j.salaryDesc,
        cityName: j.cityName,
        securityId: j.securityId?.slice(0, 20) + '...',
        encryptJobId: j.encryptJobId,
      }));
      console.error(`[greet-batch] DRY-RUN: 不会实际发送，预览 ${preview.length} 个候选:`);
      return { ok: true, dryRun: true, candidates: preview };
    }

    // ── 逐一打招呼 ──
    const results = [];
    let successCount = 0;
    for (let i = 0; i < candidates.length; i++) {
      const job = candidates[i];
      const sid = job.securityId;
      const jid = job.encryptJobId;
      const lid = job.lid || '';

      if (!sid || !jid) {
        console.error(`[greet-batch] [${i + 1}/${candidates.length}] 跳过 "${job.jobName}" — 缺少必要字段`);
        results.push({ index: i + 1, jobName: job.jobName, ok: false, error: 'missing id' });
        continue;
      }

      console.error(`[greet-batch] [${i + 1}/${candidates.length}] 打招呼: "${job.jobName}" @ "${job.brandName}" (${job.salaryDesc})`);

      const greetExpr = new ExpressionBuilder()
        .call('addFriend', sid, jid, lid)
        .build();

      try {
        const r = await ctx.loggedCall('greet-batch:greet', { securityId: sid, encryptJobId: jid, lid }, greetExpr);
        const ok = r && (r.code === 0 || r.code === '0');
        results.push({ index: i + 1, jobName: job.jobName, brandName: job.brandName, ok, code: r?.code, message: r?.message || '' });
        if (ok) { successCount++; console.error(`[greet-batch]   ✅ 已发送`); }
        else { console.error(`[greet-batch]   ❌ 失败: [${r?.code}] ${r?.message || '未知错误'}`); }
      } catch (e) {
        results.push({ index: i + 1, jobName: job.jobName, brandName: job.brandName, ok: false, error: e.message });
        console.error(`[greet-batch]   ❌ 异常: ${e.message}`);
      }

      if (i < candidates.length - 1) {
        const effectiveInterval = Math.max(intervalSec, 48);
        const delay = jitter(effectiveInterval * 1000, 0.15);
        console.error(`[greet-batch]   等待 ${Math.round(delay / 1000)}s 后继续...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    const summary = { ok: true, query: query || '(来自缓存)', totalCandidates: candidates.length, success: successCount, failed: candidates.length - successCount, results };
    console.error(`[greet-batch] 完成: ${successCount} 成功 / ${summary.failed} 失败`);
    return summary;
  }

  if (!query) {
    throw new Error('用法: node cli.js greet-batch <keyword> [--count 5] [--min-salary <K>] [--interval 50]\n' +
      '  批量搜索职位并逐一发送沟通请求。\n' +
      '  也支持从缓存引用: node cli.js greet-batch --refs @inv1:1,@inv2:3\n' +
      '  选项:\n' +
      '    --count <N>       打招呼数量（默认 5）\n' +
      '    --min-salary <K>   最低月薪过滤 (K)\n' +
      '    --interval <秒>    每次打招呼间隔（默认 50s，不低于 server 端节流下限 ~47.5s）\n' +
      '    --dry-run          只搜索不发送（预览模式）\n' +
      '    --refs @inv1:1,@inv2:3  从缓存引用直接打招呼（跳过搜索步骤）\n' +
      '    --city <code>      城市代码（默认 100010000 全国）\n' +
      '    --online           只看 HR 在线\n' +
      '    --no-negotiable    排除「面议」\n' +
      '    --skills <s1,s2>   按技能过滤\n' +
      '    --exclude <kw1,kw2> 排除关键词（公司黑名单）\n' +
      '    --sort salary-desc  按薪资降序（默认）\n' +
      '    --resume <path>     简历 PDF 路径（将来用于 LLM 招呼语）');
  }

  // ── Step 1: 搜索 ──
  const searchExpr = new ExpressionBuilder()
    .callObj('search', {
      query, city, page: 1, pageSize: Math.max(count, pageSize),
      experience, degree, salary, industry, scale, jobType,
      scene: 1, encryptExpectId: '',
    })
    .then(ExpressionBuilder.TRANSFORMS.jobList)
    .build();

  console.error(`[greet-batch] 搜索: "${query}" (city=${city})...`);
  const result = await ctx.loggedCall('greet-batch:search', { query, city }, searchExpr);

  if (!result || !result.jobList || result.jobList.length === 0) {
    console.error('[greet-batch] 搜索无结果，退出');
    return { ok: false, error: '搜索无结果', searched: query };
  }

  // ── Step 2: 管线过滤 ──
  const pipe = new Pipeline();
  if (noNegotiable) pipe.filter(excludeNegotiable());
  if (minSalary > 0) pipe.filter(salaryAbove(minSalary));
  if (onlineOnly) pipe.filter(bossOnline());
  if (skills) pipe.filter(hasAnySkill(skills.split(',').map(s => s.trim())));
  if (exclude) pipe.filter(companyNotBlacklist(exclude.split(',').map(s => s.trim())));
  pipe.filter(validJobs());

  if (sortBy === 'salary-asc') {
    const { salaryMinK } = require('../pipeline/filters');
    pipe.sort((a, b) => (salaryMinK(a) || 0) - (salaryMinK(b) || 0));
  } else {
    const { salaryMinK } = require('../pipeline/filters');
    pipe.sort((a, b) => (salaryMinK(b) || 0) - (salaryMinK(a) || 0));
  }

  pipe.limit(count);
  pipe.dedup(j => j.encryptJobId || j.securityId);

  const candidates = pipe.run(result.jobList);
  console.error(`[greet-batch] 过滤后 ${candidates.length} 个候选 (原始 ${result.jobList.length} 个)`);

  if (candidates.length === 0) {
    console.error('[greet-batch] 所有职位被管线过滤，退出');
    return { ok: false, error: '所有职位被过滤', candidates: 0, total: result.jobList.length };
  }

  // ── 预览模式 ──
  if (dryRun) {
    const preview = candidates.map((j, i) => ({
      index: i + 1,
      jobName: j.jobName,
      brandName: j.brandName,
      salaryDesc: j.salaryDesc,
      cityName: j.cityName,
      hrOnline: j.bossOnline ? '是' : '否',
      securityId: j.securityId,
      encryptJobId: j.encryptJobId,
    }));
    console.error(`[greet-batch] DRY-RUN: 不会实际发送，预览 ${preview.length} 个候选:`);
    return { ok: true, dryRun: true, candidates: preview };
  }

  // ── Step 3: 逐一打招呼 ──
  const results = [];
  let successCount = 0;
  let skipCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const job = candidates[i];
    const sid = job.securityId;
    const jid = job.encryptJobId;
    const lid = job.lid || result.lid || '';

    if (!sid || !jid) {
      console.error(`[greet-batch] [${i + 1}/${candidates.length}] 跳过 "${job.jobName}" — 缺少 securityId/encryptJobId`);
      results.push({ index: i + 1, jobName: job.jobName, brandName: job.brandName, ok: false, error: 'missing id' });
      skipCount++;
      continue;
    }

    // 每次打招呼前显示进度
    console.error(`[greet-batch] [${i + 1}/${candidates.length}] 打招呼: "${job.jobName}" @ "${job.brandName}" (${job.salaryDesc})`);

    // 构造 contact 表达式（直接调 addFriend）
    const greetExpr = new ExpressionBuilder()
      .call('addFriend', sid, jid, lid)
      .build();

    try {
      const greetResult = await ctx.loggedCall('greet-batch:greet', {
        securityId: sid, encryptJobId: jid, lid,
        jobName: job.jobName, brandName: job.brandName,
      }, greetExpr);

      const ok = greetResult && (greetResult.code === 0 || greetResult.code === '0');
      results.push({
        index: i + 1,
        jobName: job.jobName,
        brandName: job.brandName,
        salaryDesc: job.salaryDesc,
        ok,
        code: greetResult?.code,
        message: greetResult?.message || '',
      });

      if (ok) {
        successCount++;
        console.error(`[greet-batch]   ✅ 已发送`);
      } else {
        console.error(`[greet-batch]   ❌ 失败: [${greetResult?.code}] ${greetResult?.message || '未知错误'}`);
      }
    } catch (e) {
      results.push({
        index: i + 1,
        jobName: job.jobName,
        brandName: job.brandName,
        ok: false,
        error: e.message,
      });
      console.error(`[greet-batch]   ❌ 异常: ${e.message}`);
    }

    // 最后一条不需要等（server 端节流已生效）
    if (i < candidates.length - 1) {
      // server 端写操作节流下限 ~47.5s，用户设的 interval 如果低于下限会被 server 自动补齐
      const effectiveInterval = Math.max(intervalSec, 48);
      const delay = jitter(effectiveInterval * 1000, 0.15);
      console.error(`[greet-batch]   等待 ${Math.round(delay / 1000)}s 后继续...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // ── 汇总 ──
  const summary = {
    ok: true,
    query,
    totalCandidates: candidates.length,
    success: successCount,
    skipped: skipCount,
    failed: candidates.length - successCount - skipCount,
    results,
  };

  console.error(`[greet-batch] 完成: ${successCount} 成功 / ${skipCount} 跳过 / ${summary.failed} 失败`);
  return summary;
}

module.exports = { greetBatch };
