# BOSS 直聘反爬深度参考

> 本文档沉淀了 BOSS 直聘 (zhipin.com) 前端防护体系的关键知识，
> 来源于 [BossZhipin_reverse](https://github.com/warterbili/BossZhipin_reverse) 项目的逆向成果。
> boss-cli 使用 Bridge Framework（油猴脚本注入），天然绕过大部分反爬——因为我们用的是**真实浏览器**。
> 本文档帮助理解：什么时候安全、什么时候可能触发风控、以及如果将来要迁移架构需要注意什么。

---

## 1. boss-cli 的反爬安全模型

```
┌─────────────────────────────────────────────────────────┐
│  你的终端 (CLI)                                          │
│  node cli.js search python                               │
└────────────┬────────────────────────────────────────────┘
             │ HTTP (localhost)
┌────────────▼────────────────────────────────────────────┐
│  Bridge Server (server.js) :19425                       │
│  写操作节流: ~47.5s 最小间隔                              │
└────────────┬────────────────────────────────────────────┘
             │ WebSocket / HTTP Poll
┌────────────▼────────────────────────────────────────────┐
│  油猴脚本 (boss_zhipin.user.js)                          │
│  在真实 Chrome 中执行                                     │
│  ├─ 真实 TLS 指纹 (sec-ch-ua)                            │
│  ├─ 真实 Cookie (自动携带)                                │
│  ├─ 真实 window 对象                                     │
│  └─ unsafeWindow.eval() 调用页面 JS                      │
└────────────┬────────────────────────────────────────────┘
             │ 原生 fetch (credentials: 'include')
┌────────────▼────────────────────────────────────────────┐
│  BOSS 直聘 API (zhipin.com)                              │
│  看到的是: 真实浏览器 → 正常用户 → 不触发反爬               │
└─────────────────────────────────────────────────────────┘
```

**关键安全属性：**
- 所有请求由真实浏览器发起 → 反爬最核心的 TLS/sec-ch-ua/Cookie 全部原生处理
- 用户已登录 → 正常会话，API 调用与手动点击无异
- 不做频率异常的操作 → 写操作节流 ~47.5s，远低于人工操作不会触发的下限

---

## 2. BOSS 前端防护全景

```
┌─ 反调试层 (main.js / app~* / vendor-*) ─────────────────┐
│  Bm 退站+blur+OOM · Rm 原生篡改检测 · XCID/XCIT 探针     │
│  console.clear 循环清屏 · 内存炸弹 · Ef 键盘检测          │
│  → boss-cli 用油猴脚本: 用户正常浏览器访问,不触发          │
├─ Token 层 (zpAegis + security-js) ──────────────────────┤
│  请求需带 __zp_stoken__ cookie                           │
│  __zp_stoken__ = new ABC().z(seed, ts校正)               │
│  seed ← 服务端 code:37 下发 → localStorage 缓存           │
│  token 入 cookie 必须 URL 编码                            │
│  → boss-cli 用浏览器原生 fetch,自动处理                    │
├─ 指纹层 ────────────────────────────────────────────────┤
│  TLS · sec-ch-ua · Canvas · WebGL · 屏幕尺寸              │
│  → 真实 Chrome = 完美匹配                                 │
└─ 行为层 ────────────────────────────────────────────────┤
│  鼠标轨迹 · 点击间隔 · 滚动模式                            │
│  → boss-cli 写操作间隔 ~47.5s,人类操作级别                 │
└─────────────────────────────────────────────────────────┘
```

---

## 3. `__zp_stoken__` 算法

### 3.1 算法公式

```js
__zp_stoken__ = new ABC().z(seed, parseInt(ts) + 60 * (480 + new Date().getTimezoneOffset()) * 1000)
```

- `ABC` 定义在账号专属的 security 脚本 `/web/passport/zp/security-js/<rotating-name>.js`
- `ABC` 通过一个隐藏 iframe 加载，`window.ABC` 是 undefined，要从 `window.frames[i].ABC` 拿
- `z()` 非确定性：同 `(seed, ts)` 每次输出不同 token（内部掺 canvas/WebGL 指纹 + 随机数）
- 服务端不是重算校验，而是验签

### 3.2 seed 生命周期

```
请求无有效 __zp_stoken__
  → 服务端返回 code:37 + 下发 zpData.{seed, name, ts}
  → 浏览器缓存到 localStorage['passport_config']
  → 网关从缓存读 seed → new ABC().z(seed, ts) → 生成 token → 入 cookie
  → 一个 seed 约可复用 5 次
  → token 失效 → 新 code:37 → 新 seed
```

**关键发现：**
- seed 是**服务端生成并下发**的，客户端不生成 seed
- 缓存 key: `localStorage['passport_config']`
- 正常浏览几乎抓不到 code:37——只在缓存空/过期/风控时下发一次

### 3.3 Cookie 编码陷阱 ⚠️

这是最容易踩的坑。`z()` 产出的 token 含 `+` 和 `/`：

| Cookie 写法 | 结果 |
|---|---|
| 裸 token（不编码） | code:37「环境异常」(3/3 实测) |
| `encodeURIComponent(token)` | code:0，正常拿到数据 |

**为什么：** 浏览器 `Cookie.set` 会自动 URL 编码（`+`→`%2B`, `/`→`%2F`）。如果手动把裸 token 放入 Cookie，服务端 URL-decode 时 `+` 被解成空格 → token 损坏。

> **boss-cli 不受影响：** 使用浏览器原生 `fetch`（`credentials: 'include'`），浏览器自动处理编码。

### 3.4 boss-cli 的 token 工具

```bash
# 查看缓存的 passport_config
node cli.js token info

# 生成 __zp_stoken__（从缓存读 seed）
node cli.js token gen

# 手动指定 seed
node cli.js token gen --seed <seed> --ts <timestamp>
```

---

## 4. 反调试七层

| 层 | 检测/攻击 | 原理 |
|---|---|---|
| `Bm()` | DevTools检测 → `window.open("","_self")` + `close()` + blur遮罩 + OOM | 检测原生方法被 hook |
| `Rm()` | 原生方法篡改检测 | 检查 `[native code]` toString / `instanceof Location` |
| `XCID()`/`XCIT()` | ~500ms 循环 devtools 探针 + console 刷屏 | `createElement("div").__defineGetter__("id",…)` |
| console flood | `setInterval` 500ms 循环清屏+刷屏 | 干扰调试 |
| 内存炸弹 | `new Array(1e9).fill()` × 循环 × 递归 | method_modify 命中后引爆 |
| `Ef` | Ctrl/Cmd+Shift+Alt+I/J 快捷键检测 | keyCode 73/74 |
| `__defineSetter__` | 时序/帧间隔 devtools 检测 | 次要 |

**boss-cli 安全原因：** 油猴脚本在用户正常浏览器中运行。反调试检测的是 DevTools 打开/原生方法被 hook 等异常状态——正常浏览器不会触发。

**⚠️「绕过，别翻转」心法：** 反调试的门是 `if(n && i && a && o)`——四项全 true = 环境干净走安全分支。把门翻成 `if(false)` = 强制走惩罚分支 = 自爆（内存炸弹）。正确做法是把整个检测函数置空。

---

## 5. API 错误码速查

| code | 含义 | 处理 |
|---|---|---|
| `0` | 成功 | — |
| `37` | `__zp_stoken__` 无效/过期，同时下发新 seed | 等待浏览器自动刷新 token；持续出现说明编码有问题 |
| `1` | 通用错误 | 检查参数 |
| `100` | 未登录 | 检查浏览器登录状态 |
| `101` | 无权限 | 可能是账号被限制 |

---

## 6. 节流与反风控

### 6.1 boss-cli 的 P1 结构性节流

Server 端对写操作（`opType='write'`）实施 per-site 最小间隔约 47.5s ±15%。  
无论 CLI 怎么调用都无法突破。这是结构性保护。

### 6.2 推荐的操作频率

| 操作 | 推荐间隔 | 说明 |
|---|---|---|
| 搜索 | 2-5s | 批量翻页时的页间间隔 |
| 打招呼 | 48-60s | server 端写操作强制最小 47.5s |
| 获取详情 | 1-3s | 读操作，不触发节流 |
| 聊天查询 | 2-5s | 读操作 |

### 6.3 批量操作安全指南

```bash
# ✅ 安全: server 端自动节流
node cli.js greet-batch python --count 5

# ✅ 安全: 页间有随机抖动
node cli.js search python --pages 10 --interval 3

# ❌ 危险: 多个 CLI 进程同时对同一 site 操作
# 每个 CLI 进程独立, server 端的 per-site 节流全局生效, 但仍应避免

# ❌ 危险: 手动高频调用
# while true; do node cli.js contact ...; done
# → server 端节流会让每次写操作至少等待 ~40s, 但不要尝试绕过
```

---

## 7. 三种数据获取方案对比

| | (A) Bridge 油猴 (当前) | (B) 浏览器算 token + 外部请求 | (C) 纯外部请求 |
|---|---|---|---|
| 谁发请求 | 浏览器 | 自己构造 HTTP | 自己构造 HTTP |
| token | 浏览器原生（含编码） | 调用 genStoken 后手动放 Cookie | 需要自己算/管理 |
| TLS | 真实 Chrome | requests 库（指纹可被检测） | requests 库 |
| 复杂度 | ★ (最简单) | ★★★ | ★★★★★ |
| 适用 | 默认方案 | 需要脱离浏览器时 | 不推荐 |

**方案 A 是本项目的推荐方案**，也是最省心的方案。

---

## 8. 如果反爬升级了怎么办

1. 运行 `node cli.js status` 确认 Bridge 连接正常
2. 如果 API 调用持续返回 code:37 → 可能是 BOSS token 算法变了
3. 如果搜索/打招呼返回异常 code → 检查浏览器中 BOSS 页面是否正常
4. BOSS 反调试 JS 升级与 boss-cli 无关（用的是真实浏览器）
5. BOSS API 端点变化时，更新 `lib/shared/bootstrap.js` 中的 URL

---

## 参考

- [BossZhipin_reverse](https://github.com/warterbili/BossZhipin_reverse) — 反爬逆向 + mitm-rpc 方案
- [BossZhiPin_Job_Search](https://github.com/longsizhuo/BossZhiPin_Job_Search) — nodriver + LLM 自动化求职
