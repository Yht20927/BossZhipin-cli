// lib/audit.js — 审计日志模块
//
// v2 起：endOperation 末尾旁路写入 SQLite events 表（lib/memory/events.js）。
// SQLite 写失败不影响主流程；audit.json 仍是真实之源，事件流是查询副本。
// 删除模块级 _cache：每次 load() 直接读 audit.json，避免并发 CLI 互相丢更新。

const fs = require('fs');
const path = require('path');

// 默认 logs 在项目根；通过 XHS_LOG_DIR 可重定向（测试用）
const LOG_DIR = process.env.XHS_LOG_DIR
  ? path.resolve(process.env.XHS_LOG_DIR)
  : path.join(__dirname, '..', 'logs');
const AUDIT_FILE = path.join(LOG_DIR, 'audit.json');
const RESULTS_DIR = path.join(LOG_DIR, 'results');

// 延迟加载，避免 better-sqlite3 加载失败时整个 audit 模块挂掉
let _events = null;
function eventsModule() {
  if (_events === null) {
    try { _events = require('./memory/events'); }
    catch (e) {
      if (process.env.XHS_DEBUG) console.warn('[audit] events module unavailable:', e.message);
      _events = false;
    }
  }
  return _events || null;
}

class AuditLogger {
  constructor() {
    this._audit = null;
    this._currentOp = null;
    // 操作栈：支持复合命令嵌套（suggest→analyze→get）。_currentOp 始终是栈顶。
    // 之前是单字段，嵌套命令的 startOperation 互相覆盖 → endOperation 时 _currentOp=null
    // → 复合命令（suggest/analyze/browse）审计永远停在 'running'，events 表也缺失。
    this._opStack = [];
    this._noLog = false;
  }

  setNoLog(v) { this._noLog = v; }

  ensureDirs() {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  load() {
    if (!fs.existsSync(AUDIT_FILE)) {
      return { version: '2.0', updated: new Date().toISOString(), sessions: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
    } catch (e) {
      return { version: '2.0', updated: new Date().toISOString(), sessions: [] };
    }
  }

  save() {
    if (this._noLog) return;
    this._audit.updated = new Date().toISOString();
    const tmp = AUDIT_FILE + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(this._audit, null, 2));
      fs.renameSync(tmp, AUDIT_FILE);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  }

  newSession() {
    const last = this._audit.sessions[this._audit.sessions.length - 1];
    if (last && !last.ended) return last;
    const s = {
      sessionId: Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
      started: new Date().toISOString(),
      ended: null,
      operations: [],
    };
    this._audit.sessions.push(s);
    if (this._audit.sessions.length > 100) this._audit.sessions = this._audit.sessions.slice(-100);
    return s;
  }

  startOperation(cmd, args) {
    if (this._noLog) return;
    this.ensureDirs();
    // 仅在栈空（顶层操作）时重载 audit.json 拉取其他进程的写入；
    // 嵌套调用（suggest→analyze→get）复用内存中的 _audit，保持 op 对象同一性——
    // 否则 reload 会创建新的 op 对象，栈里持有的旧引用与 _audit.sessions 里的新对象脱节，
    // 导致 endOperation 落盘的是未 finalize 的新对象（status 永远 'running'）。
    if (this._opStack.length === 0) {
      this._audit = this.load();
    }
    const s = this.newSession();
    const op = {
      index: s.operations.length + 1,
      command: cmd,
      args,
      started: new Date().toISOString(),
      ended: null,
      durationMs: null,
      status: 'running',
      summary: {},
      apiCalls: [],
    };
    s.operations.push(op);
    this._opStack.push(op);   // 压栈：嵌套命令（suggest→analyze→get）各自独立完成
    this._currentOp = op;     // _currentOp 始终是栈顶
    this.save();
  }

  logApiCall(endpoint, params, durationMs, status, summary) {
    if (this._noLog || !this._currentOp) return;
    this._currentOp.apiCalls.push({
      seq: this._currentOp.apiCalls.length + 1,
      endpoint,
      params,
      durationMs,
      status,
      summary: summary || {},
    });
  }

  endOperation(status, summary, resultData, error) {
    if (this._noLog || !this._currentOp) return;
    this._currentOp.ended = new Date().toISOString();
    this._currentOp.durationMs = Date.now() - new Date(this._currentOp.started).getTime();
    this._currentOp.status = status;
    if (summary) this._currentOp.summary = summary;
    if (error) this._currentOp.error = error;

    const largeResults = ['search', 'job', 'friends', 'chat', 'recommend'];
    if (resultData && largeResults.includes(this._currentOp.command) && status === 'success') {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      let label = this._currentOp.command;
      if (this._currentOp.args.query) label += '-' + sanitize(this._currentOp.args.query);
      else if (this._currentOp.args.securityId) label += '-' + sanitize(this._currentOp.args.securityId);
      else if (this._currentOp.args.secretId) label += '-' + sanitize(this._currentOp.args.secretId);
      const fp = path.join(RESULTS_DIR, label + '-' + ts + '.json');
      try {
        fs.writeFileSync(fp, JSON.stringify({
          command: this._currentOp.command,
          args: this._currentOp.args,
          started: this._currentOp.started,
          ...resultData,
        }, null, 2));
        this._currentOp.resultFile = 'logs/results/' + path.basename(fp);
      } catch (e) { /* 落盘失败不阻塞 */ }
    } else if (resultData && status === 'success') {
      this._currentOp.result = resultData;
    }
    // AUDIT_DOUBLE_WRITE=false 时停双写 audit.json（events 表为唯一源；默认 true 保持兼容）
    if (process.env.AUDIT_DOUBLE_WRITE !== 'false') {
      this.save();
    }

    // ── 旁路：写入 SQLite events 表（失败不影响主流程） ──
    try {
      const events = eventsModule();
      if (events) {
        const op = this._currentOp;
        const session = (this._audit && this._audit.sessions || []).slice(-1)[0];
        events.append({
          ts: op.ended ? new Date(op.ended).getTime() : Date.now(),
          sessionId: session ? session.sessionId : null,
          command: op.command,
          status: op.status,
          durationMs: op.durationMs,
          query: op.args && (op.args.query || op.args.keyword) || null,
          securityId: op.args && (op.args.securityId) || null,
          secretId: op.args && (op.args.secretId) || null,
          args: op.args || null,
          summary: op.summary || null,
          error: op.error || null,
          resultPath: op.resultFile || null,
        });
      }
    } catch (e) { /* 静默 */ }

    // 弹栈，恢复上层命令为当前（支持 suggest→analyze→get 嵌套）
    this._opStack.pop();
    this._currentOp = this._opStack[this._opStack.length - 1] || null;
  }

  /**
   * 查找某笔记上次成功拉取的时间（Unix 毫秒），用于 --new 增量（与 create_time 毫秒单位对齐）。
   * 优先走 SQLite events 表（O(log N) 索引覆盖），失败/未命中再回退 audit.json 全表扫。
   */
  findLastFetchTime(noteId) {
    // ── 路径 A：SQLite ──
    try {
      const events = eventsModule();
      if (events && typeof events.findLastFetchTime === 'function') {
        const t = events.findLastFetchTime(noteId);
        if (t != null) return t;
        // events 有记录但该 note 无 get 记录：不再回退 audit.json（避免每次 --new 都全表扫）
        if (events.count() > 0) return null;
      }
    } catch (e) { /* 静默回退 */ }

    // ── 路径 B：audit.json 全表扫（兼容历史） ──
    const a = this.load();
    let latest = null;
    for (const s of (a.sessions || [])) {
      for (const op of (s.operations || [])) {
        if (op.command === 'get' && op.args && op.args.note_id === noteId && op.status === 'success' && op.ended) {
          const t = new Date(op.ended).getTime();
          if (latest === null || t > latest) latest = t;
        }
      }
    }
    return latest;
  }
}

function sanitize(s) {
  return (s || '').replace(/[<>:"/\\|?*'\s]/g, '_').substring(0, 20);
}

module.exports = { AuditLogger };
