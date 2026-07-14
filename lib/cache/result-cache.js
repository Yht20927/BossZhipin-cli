// lib/cache/result-cache.js — 结果缓存 + @ref 引用系统
//
// 设计目标：
// - 每次搜索/推荐调用生成唯一 invId，结果落盘缓存
// - 输出中 securityId/encryptJobId/encryptBossId/lid 替换为 _ref 短引用
// - 下游命令自动解析 @invId:N 语法，从缓存恢复长 ID
// - TTL 24h，自动清理过期条目，最多保留 50 个

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── 缓存目录 ──
const CACHE_DIR = process.env.BOSS_CACHE_DIR
  ? path.resolve(process.env.BOSS_CACHE_DIR)
  : path.join(require('os').homedir(), '.boss', 'cache');

const CACHE_INDEX = path.join(CACHE_DIR, '_index.json');

// ── 长 ID 字段列表 ──
const SLIM_FIELDS = ['securityId', 'encryptJobId', 'encryptBossId', 'lid'];

class ResultCache {
  constructor(opts = {}) {
    this.ttlHours = opts.ttlHours || 24;
    this.maxEntries = opts.maxEntries || 50;
    this._lastInvId = null;  // 最近一次创建的 invId（支持 @N 简写）
  }

  // ═══════════════════════════════════════════
  // 公共 API
  // ═══════════════════════════════════════════

  /**
   * 创建一次调用记录，返回唯一 invId。
   * 同时触发 gc() 清理过期条目。
   *
   * @param {string} endpoint - 'search' | 'recommend' | 'friends'
   * @param {object} params - 调用参数（用于记录和诊断）
   * @returns {string} invId
   */
  createInvocation(endpoint, params = {}) {
    this._ensureDir();
    const now = Date.now();
    const d = new Date(now);
    const yymmdd = d.toISOString().slice(2, 10).replace(/-/g, '');
    const hhmmss = d.toISOString().slice(11, 19).replace(/:/g, '');
    const rand = crypto.randomBytes(2).toString('hex'); // 4 hex
    const invId = `${endpoint}-${yymmdd}-${hhmmss}-${rand}`;

    this._lastInvId = invId;

    // 自动清理
    this.gc();

    // 记录到索引
    const idx = this._readIndex();
    idx.push({
      invId,
      endpoint,
      params,
      ts: now,
      expiresAt: now + this.ttlHours * 3600 * 1000,
      count: 0,
    });

    // 限制条目数
    while (idx.length > this.maxEntries) {
      const removed = idx.shift();
      this._deleteCacheFile(removed.invId);
    }

    this._writeIndex(idx);
    return invId;
  }

  /**
   * 存储记录到缓存。
   *
   * @param {string} invId - createInvocation 返回的 ID
   * @param {Array<object>} records - 职位列表（含完整长 ID）
   * @param {object} opts
   * @param {object} [opts.topLevel] - 顶层附加字段 { resCount, hasMore, lid }
   */
  store(invId, records, opts = {}) {
    const cacheFile = this._cachePath(invId);
    const idx = this._readIndex();
    const entry = idx.find(e => e.invId === invId);
    if (!entry) return; // invId 不存在（可能被 gc 清理）

    const data = {
      invId,
      ts: entry.ts,
      expiresAt: entry.expiresAt,
      endpoint: entry.endpoint,
      params: entry.params,
      count: records.length,
      ...(opts.topLevel || {}),
      records: records.map((r, i) => ({
        _i: i,
        ...r, // 保留所有语义字段 + 长 ID
      })),
    };

    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    entry.count = records.length;
    this._writeIndex(idx);
  }

  /**
   * 精简输出：将长 ID 替换为 _ref 引用，同时附加 _invId。
   * 每个 item 只保留语义字段 + _ref。
   *
   * @param {string} invId
   * @param {object} result - 原始结果对象 { resCount, hasMore, lid, jobList, ... }
   * @returns {object} 精简后的结果
   */
  slimOutput(invId, result) {
    if (!result || !result.jobList) return result;

    const slim = { ...result };
    delete slim.lid; // top-level lid 已被 _invId 替代

    slim._invId = invId;
    slim.jobList = result.jobList.map((item, i) => {
      const slimItem = {};
      // 保留语义字段，跳过 SLIM_FIELDS 中的长 ID
      for (const [k, v] of Object.entries(item)) {
        if (SLIM_FIELDS.includes(k)) continue;
        slimItem[k] = v;
      }
      // 附加引用（1-indexed，更符合人类习惯）
      slimItem._ref = `@${invId}:${i + 1}`;
      return slimItem;
    });

    return slim;
  }

  /**
   * 解析 @ref 引用，返回完整记录。
   * 只支持精确格式: @invId:N
   *
   * @param {string} ref - 引用字符串，如 "@search-260714-131522-a3f2:1"
   * @returns {object|null} 完整记录（含所有长 ID），或 null
   */
  resolve(ref) {
    const parsed = this._parseRef(ref);
    if (!parsed) return null;

    const cacheFile = this._cachePath(parsed.invId);
    if (!fs.existsSync(cacheFile)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      // 检查过期
      if (data.expiresAt && Date.now() > data.expiresAt) return null;

      if (parsed.index !== null && parsed.index !== undefined) {
        const record = data.records[parsed.index];
        if (!record) return null;
        const { _i, ...full } = record;
        return full;
      }

      return data;
    } catch (e) {
      return null;
    }
  }

  /**
   * 判断字符串是否是 @ref 引用格式
   */
  isRef(str) {
    return typeof str === 'string' && /^@[\w-]+:\d+$/.test(str);
  }

  /**
   * @returns {string|null} 最近一次调用的 invId
   */
  get lastInvId() {
    if (this._lastInvId) return this._lastInvId;
    const idx = this._readIndex();
    if (idx.length > 0) {
      this._lastInvId = idx[idx.length - 1].invId;
      return this._lastInvId;
    }
    return null;
  }

  /**
   * 批量解析 --refs 参数
   * @returns {Array<object>} 完整记录数组
   */
  resolveAll(refsStr) {
    return refsStr.split(',').map(s => s.trim()).filter(Boolean).map(ref => this.resolve(ref)).filter(Boolean);
  }

  // ═══════════════════════════════════════════
  // 管理
  // ═══════════════════════════════════════════

  /** 列出所有缓存条目 */
  list() {
    return this._readIndex().map(e => ({
      ...e,
      age: Math.round((Date.now() - e.ts) / 1000 / 60),
      expired: e.expiresAt ? Date.now() > e.expiresAt : false,
    }));
  }

  /** 查看某次调用的缓存 */
  show(invId) {
    const cacheFile = this._cachePath(invId);
    if (!fs.existsSync(cacheFile)) return null;
    try {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  /** 清理过期条目，返回清理数量 */
  gc() {
    const idx = this._readIndex();
    const valid = [];
    let cleaned = 0;
    for (const e of idx) {
      if (e.expiresAt && Date.now() > e.expiresAt) {
        this._deleteCacheFile(e.invId);
        cleaned++;
      } else {
        valid.push(e);
      }
    }
    if (cleaned > 0) {
      this._writeIndex(valid);
    }
    return cleaned;
  }

  /** 清除所有缓存 */
  clear() {
    const idx = this._readIndex();
    for (const e of idx) {
      this._deleteCacheFile(e.invId);
    }
    try { fs.unlinkSync(CACHE_INDEX); } catch (e) { /* */ }
    this._lastInvId = null;
  }

  // ═══════════════════════════════════════════
  // 内部
  // ═══════════════════════════════════════════

  _ensureDir() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  _cachePath(invId) {
    return path.join(CACHE_DIR, `${invId}.json`);
  }

  _deleteCacheFile(invId) {
    try { fs.unlinkSync(this._cachePath(invId)); } catch (e) { /* */ }
  }

  _readIndex() {
    if (!fs.existsSync(CACHE_INDEX)) return [];
    try {
      return JSON.parse(fs.readFileSync(CACHE_INDEX, 'utf8'));
    } catch (e) {
      return [];
    }
  }

  _writeIndex(idx) {
    this._ensureDir();
    fs.writeFileSync(CACHE_INDEX, JSON.stringify(idx, null, 2));
  }

  /**
   * 解析 @ref 为 { invId, index }
   * 只接受精确格式: @<invId>:<N>  （例如 @search-260714-131522-a3f2:1）
   */
  _parseRef(ref) {
    if (typeof ref !== 'string' || !ref.startsWith('@')) return null;
    const s = ref.slice(1);
    const colon = s.lastIndexOf(':');
    if (colon === -1) return null;  // 必需要有 :N

    const invId = s.slice(0, colon);
    const index = parseInt(s.slice(colon + 1));
    if (isNaN(index)) return null;
    return { invId, index: index - 1 };  // 1-indexed → 0-indexed
  }
}

// ── 全局单例 ──
let _instance = null;
function getCache() {
  if (!_instance) {
    _instance = new ResultCache();
  }
  return _instance;
}

module.exports = { ResultCache, getCache };
