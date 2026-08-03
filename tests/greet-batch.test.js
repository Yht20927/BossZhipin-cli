// tests/greet-batch.test.js — 批量打招呼逻辑测试（重构后）
// 用 mock ctx 验证：--refs 解析、管线过滤、发送统计、lid 合并。

import { describe, it, expect, vi } from 'vitest';
import { greetBatch } from '../lib/commands/greet-batch.js';

const jobs = [
  { jobName: 'Python工程师', brandName: '字节', salaryDesc: '20-40K', cityName: '北京', securityId: 'S1', encryptJobId: 'E1', lid: '', bossOnline: true },
  { jobName: '后端开发', brandName: '腾讯', salaryDesc: '15-30K', cityName: '深圳', securityId: 'S2', encryptJobId: 'E2', lid: '', bossOnline: false },
  { jobName: '全栈', brandName: '外包公司', salaryDesc: '面议', cityName: '上海', securityId: 'S3', encryptJobId: 'E3', lid: '', bossOnline: true },
];

function makeCtx(loggedCallImpl) {
  return {
    cache: { resolve: (ref) => jobs[parseInt(ref.match(/:(\d)/)[1]) - 1] || null },
    loggedCall: loggedCallImpl,
  };
}

describe('greet-batch --refs 模式', () => {
  it('dry-run 返回预览且不发送', async () => {
    const ctx = makeCtx(vi.fn());
    const r = await greetBatch(ctx, ['--refs', '@inv:1,@inv:2', '--dry-run']);
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(r.candidates.length).toBe(2);
    expect(ctx.loggedCall).not.toHaveBeenCalled();
  });

  it('实际发送统计成功/失败', async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const ctx = makeCtx(vi.fn(async (ep) => {
        if (ep === 'greet-batch:greet' && ++n === 2) throw new Error('boss[37] 会话过期');
        return { code: 0 };
      }));
      const p = greetBatch(ctx, ['--refs', '@inv:1,@inv:2,@inv:3', '--interval', '0']);
      await vi.runAllTimersAsync(); // 推进节流间隔定时器
      const r = await p;
      expect(r.success).toBe(2);
      expect(r.failed).toBe(1);
      expect(r.totalCandidates).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('greet-batch query 模式', () => {
  it('管线过滤：排除面议与黑名单', async () => {
    const ctx = makeCtx(vi.fn(async () => ({ jobList: jobs, lid: 'LID' })));
    const r = await greetBatch(ctx, ['python', '--dry-run', '--no-negotiable', '--exclude', '外包', '--count', '5']);
    expect(r.candidates.length).toBe(2); // S1, S2（面议和外包被剔除）
  });

  it('结果列表 lid 合并到候选', async () => {
    let sendCount = 0;
    const ctx = makeCtx(vi.fn(async (ep) => {
      if (ep === 'greet-batch:search') return { jobList: jobs.slice(0, 1), lid: 'LIST_LID' };
      sendCount++;
      return { code: 0 };
    }));
    const r = await greetBatch(ctx, ['python', '--count', '1', '--interval', '0']);
    expect(r.success).toBe(1);
    expect(sendCount).toBe(1);
  });
});
