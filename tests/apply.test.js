// tests/apply.test.js — 投递记录状态映射测试

import { describe, it, expect, vi } from 'vitest';
import { apply } from '../lib/commands/apply.js';

function makeCtx(deliverList) {
  return {
    cache: {},
    loggedCall: vi.fn(async () => ({ deliverList })),
  };
}

describe('apply 投递记录', () => {
  it('状态码映射为文字', async () => {
    const ctx = makeCtx([
      { jobName: 'Python', brandName: '字节', deliverStatus: 0 },
      { jobName: 'Go', brandName: '腾讯', deliverStatus: 3 },
      { jobName: 'Java', brandName: '阿里', deliverStatus: 6 },
    ]);
    const r = await apply(ctx, []);
    expect(r.count).toBe(3);
    expect(r.statusCounts).toEqual({ 已投递: 1, 待面试: 1, 不合适: 1 });
    expect(r.deliverList[0].statusText).toBe('已投递');
    expect(r.deliverList[1].statusText).toBe('待面试');
  });

  it('按状态文字筛选', async () => {
    const ctx = makeCtx([
      { jobName: 'Python', deliverStatus: 0 },
      { jobName: 'Go', deliverStatus: 3 },
      { jobName: 'Java', deliverStatus: 4 },
    ]);
    const r = await apply(ctx, ['--status', '面试']);
    expect(r.count).toBe(2); // 待面试 + 已面试
  });
});
