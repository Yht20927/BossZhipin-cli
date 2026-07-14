// lib/commands/llm-greet.js — LLM 招呼语生成 + 发送
//
// 流程: 获取职位详情 → LLM 生成招呼语 → 审核 → 发送

const fs = require('fs');
const path = require('path');
const { getArg, positionalArgs } = require('./helpers');
const { ExpressionBuilder } = require('../expression');
const { generateLetter } = require('../llm');

// ── 招呼语审核 ──
function validateLetter(text) {
  const reasons = [];
  if (!text || text.length < 15) reasons.push('太短（<15字）');
  if (text.length > 500) reasons.push('太长（>500字）');
  if (!/[一-鿿]/.test(text)) reasons.push('缺少中文字符');

  // 黑名单模式
  const blacklist = ['Error', 'Traceback', 'As an AI', '```', '抱歉，我', 'I apologize'];
  for (const kw of blacklist) {
    if (text.includes(kw)) reasons.push(`含敏感词: "${kw}"`);
  }

  return { ok: reasons.length === 0, reasons };
}

async function llmGreet(ctx, args) {
  const securityId = positionalArgs(args)[0];
  const jobId = getArg(args, 'jobId', '');
  const lid = getArg(args, 'lid', '');
  const dryRun = args.includes('--dry-run');
  const resumePath = getArg(args, 'resume', '');
  const userName = getArg(args, 'name', process.env.BOSS_USR_NAME || '求职者');

  if (!securityId) {
    throw new Error(
      '用法: node cli.js llm-greet <securityId> --jobId <encryptJobId> [--lid <lid>] [--resume <path>] [--dry-run]\n' +
      '  获取职位详情后，调用 LLM 生成个性化招呼语，审核后发送。\n' +
      '  环境变量:\n' +
      '    LLM_API_KEY     - LLM API Key（必填）\n' +
      '    LLM_BASE_URL    - LLM 端点 URL（默认 OpenAI）\n' +
      '    LLM_MODEL       - 模型名（默认 gpt-4o-mini）\n' +
      '    BOSS_USR_NAME   - 你的名字（招呼语署名）'
    );
  }

  // ── Step 1: 获取职位详情 ──
  console.error(`[llm-greet] 获取职位详情: securityId=${securityId}`);
  const detailExpr = new ExpressionBuilder()
    .call('jobDetail', securityId, lid)
    .then(ExpressionBuilder.TRANSFORMS.jobDetail)
    .build();

  const detail = await ctx.loggedCall('llm-greet:job', { securityId, lid }, detailExpr);
  const jobInfo = detail?.jobInfo;
  if (!jobInfo) {
    throw new Error('获取职位详情失败');
  }

  const jobDescription = [
    `职位: ${jobInfo.jobName || ''}`,
    `公司: ${jobInfo.brandName || ''} (${jobInfo.brandStageName || ''} / ${jobInfo.brandScaleName || ''})`,
    `行业: ${jobInfo.brandIndustry || ''}`,
    `薪资: ${jobInfo.salaryDesc || ''}`,
    `地点: ${jobInfo.cityName || ''} ${jobInfo.areaDistrict || ''}`,
    `经验: ${jobInfo.jobExperience || ''}  学历: ${jobInfo.jobDegree || ''}`,
    '',
    `职位描述:`,
    jobInfo.postDescription || '（无）',
  ].join('\n');

  console.error(`[llm-greet] 职位: ${jobInfo.jobName} @ ${jobInfo.brandName}`);

  // ── Step 2: 读取简历（如有）──
  let resumeText = '';
  if (resumePath) {
    const resolved = path.resolve(resumePath);
    if (fs.existsSync(resolved)) {
      resumeText = fs.readFileSync(resolved, 'utf8');
      console.error(`[llm-greet] 简历: ${resolved} (${resumeText.length} 字)`);
    } else {
      console.error(`[llm-greet] 简历文件不存在: ${resolved}，将不使用简历上下文`);
    }
  }

  // ── Step 3: LLM 生成招呼语 ──
  console.error('[llm-greet] 调用 LLM 生成招呼语...');
  let letter;
  try {
    letter = await generateLetter({
      userName,
      jobDescription,
      resumeText: resumeText || undefined,
    });
  } catch (e) {
    throw new Error(`LLM 生成招呼语失败: ${e.message}`);
  }

  console.error(`[llm-greet] 招呼语 (${letter.length} 字):`);
  console.error('───');
  console.error(letter);
  console.error('───');

  // ── Step 4: 审核 ──
  const validation = validateLetter(letter);
  if (!validation.ok) {
    console.error(`[llm-greet] ⛔ 审核不通过: ${validation.reasons.join(', ')}`);
    if (dryRun) {
      return { ok: false, stage: 'validation_failed', reasons: validation.reasons, letter };
    }
    throw new Error(`招呼语审核不通过: ${validation.reasons.join(', ')}`);
  }

  // ── Step 5: 预览/发送 ──
  if (dryRun) {
    console.error('[llm-greet] DRY-RUN: 不会实际发送');
    return {
      ok: true,
      dryRun: true,
      jobInfo: {
        jobName: jobInfo.jobName,
        brandName: jobInfo.brandName,
        salaryDesc: jobInfo.salaryDesc,
      },
      letter,
      validation,
    };
  }

  // ── 发送沟通请求 ──
  console.error('[llm-greet] 发送沟通请求...');
  const greetExpr = new ExpressionBuilder()
    .call('addFriend', securityId, jobId, lid)
    .build();

  const result = await ctx.loggedCall('llm-greet:send', { securityId, jobId, lid, letterLen: letter.length }, greetExpr);

  const summary = {
    ok: result && (result.code === 0 || result.code === '0'),
    code: result?.code,
    message: result?.message || '',
    jobInfo: {
      jobName: jobInfo.jobName,
      brandName: jobInfo.brandName,
      salaryDesc: jobInfo.salaryDesc,
    },
    letter,
    letterLen: letter.length,
    validation,
  };

  if (summary.ok) {
    console.error('[llm-greet] ✅ 招呼语已发送');
  } else {
    console.error(`[llm-greet] ❌ 发送失败: [${result?.code}] ${result?.message || '未知错误'}`);
  }

  return summary;
}

module.exports = { llmGreet, validateLetter };
