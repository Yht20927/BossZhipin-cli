// lib/client/bridge-client.js — HTTP 客户端封装（CLI / Agent SDK 共用）

const http = require('http');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 19425;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

class BridgeClient {
  /**
   * @param {object} options
   * @param {string} [options.host='127.0.0.1']
   * @param {number} [options.port=19424]
   * @param {string} [options.token=''] - 访问令牌（也可从 XHS_BRIDGE_TOKEN 环境变量读取）
   */
  constructor(options = {}) {
    this.host = options.host || DEFAULT_HOST;
    this.port = options.port || DEFAULT_PORT;
    this.token = options.token || process.env.XHS_BRIDGE_TOKEN || '';
  }

  /**
   * 调用油猴执行表达式。
   * @param {object} opts
   * @param {string} opts.site
   * @param {string} opts.expression
   * @param {boolean} [opts.awaitPromise=true]
   * @param {number} [opts.connIndex=0]
   * @param {number} [opts.timeout]
   * @param {boolean} [opts.noRetry=false] - 写操作（post/like/delete）必须传 true，
   *                                          避免「超时但已写入 → 重试 → 重复发布」。
   * @param {'write'|'read'} [opts.opType='read'] - 操作类型。'write' 触发服务端
   *                                          per-site 最小间隔节流（≈40-54s），
   *                                          从结构层防住「命令间忽略间隔」(P1)。
   * @param {boolean} [opts.noThrottle=false] - true 跳过服务端节流（--fast 调试通道）。
   */
  async call({ site, expression, awaitPromise = true, connIndex = 0, timeout, noRetry = false, opType = 'read', noThrottle = false }) {
    const maxRetries = noRetry ? 0 : MAX_RETRIES;
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this._post('/api/call', {
          site, expression, awaitPromise, connIndex, timeout, opType, noThrottle,
        });
      } catch (e) {
        lastErr = e;
        if (attempt < maxRetries && !e.message.includes('Bridge Server 未启动')) {
          // 重试延迟加入随机抖动：基础值 × (1 ± 30%)
          const jittered = RETRY_DELAY_MS * (attempt + 1) * (0.7 + Math.random() * 0.6);
          await new Promise(r => setTimeout(r, jittered));
        }
      }
    }
    throw lastErr;
  }

  async status() {
    return this._get('/api/status');
  }

  async health() {
    return this._get('/api/health');
  }

  _post(path, body) {
    return this._request('POST', path, body);
  }

  _get(path) {
    return this._request('GET', path);
  }

  _request(method, path, body) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;

      // 写操作可能被 server 端 _enforceThrottle 节流等待最多 ~55s（WRITE_MIN_INTERVAL_MS=47500 ±15%），
      // 再加上 eval 派发时间。若 socket 超时仍用 35s，被节流的写会触发 CLI 侧 'timeout' →
      // req.destroy() → CLI 抛错但 server 仍执行 eval → ghost write + corpus/markReplied 未执行 +
      // 用户重试致重复评论（正是 noRetry 想防的）。故写操作 socket 超时必须 > 55s + eval(~30s)。
      const opType = body && body.opType;
      const socketTimeout = opType === 'write' ? 95000 : 35000;

      const options = {
        hostname: this.host,
        port: this.port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: socketTimeout,
      };

      if (this.token) {
        options.headers['Authorization'] = `Bearer ${this.token}`;
      }

      if (payload) {
        options.headers['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON response (${data.length} bytes, may be HTML/auth page)`));
          }
        });
      });

      req.on('error', (e) => {
        reject(new Error(`Bridge Server 未启动 (${this.host}:${this.port}) — 请先运行 node server.js`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }
}

module.exports = { BridgeClient };
