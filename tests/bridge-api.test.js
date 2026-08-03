// tests/bridge-api.test.js — __bridge API 单一事实源完整性测试
// 保证 bridge-api.js（bootstrap 自愈 + 油猴脚本共用）语法正确且包含全部 API。

import { describe, it, expect } from 'vitest';
import { BRIDGE_API } from '../lib/shared/bridge-api.js';
import { BRIDGE_BOOTSTRAP } from '../lib/shared/bootstrap.js';

const REQUIRED_API = [
  // 原有
  'getUserInfo', 'search', 'jobDetail', 'recommendJobs', 'filterConditions',
  'addFriend', 'msgHistory', 'resumeStep', 'expectList', 'genStoken',
  'getPassportConfig', 'refreshSession', 'ensureToken',
  // 新增
  'chatList', 'newGreets', 'chatHistory', 'sendChatMessage', 'navigateToChat',
  'exchangeRequest', 'resumeBaseinfo', 'resumeExpect', 'resumeStatus', 'deliverList',
];

describe('bridge-api 唯一事实源', () => {
  it('BRIDGE_API 是可编译的 JS（eval 前语法检查）', () => {
    expect(() => new Function(BRIDGE_API)).not.toThrow();
  });

  it('包含全部必需 API', () => {
    for (const api of REQUIRED_API) {
      expect(BRIDGE_API).toContain(api);
    }
  });

  it('bootstrap 自愈注入与 bridge-api 完全一致', () => {
    expect(BRIDGE_BOOTSTRAP).toBe(BRIDGE_API);
  });
});
