# boss-cli — BOSS 直聘 CLI 工具

通过 Bridge Server + 油猴脚本架构，在命令行中操作 [BOSS 直聘](https://www.zhipin.com)，包括搜索职位、查看详情、浏览推荐、管理好友、拉取聊天记录等。

## 架构概览

```
┌──────────┐   HTTP (JSON)    ┌───────────────┐   WebSocket / HTTP Poll   ┌──────────────────┐
│  cli.js  │ ────────────────> │  Bridge Server │ <──────────────────────── │  油猴脚本 (浏览器)  │
│  (CLI)   │ <──────────────── │  (server.js)   │ ────────────────────────> │  boss_zhipin.user  │
└──────────┘                  └───────────────┘                           └──────────────────┘
   localhost                      localhost:19425                           zhipin.com (含登录态)
```

- **CLI** 将命令编译为 JavaScript 表达式，通过 HTTP POST 发送给 Bridge Server
- **Bridge Server** 将表达式转发给浏览器（WebSocket 优先，HTTP 轮询兜底）
- **油猴脚本** 在 `zhipin.com` 页面上下文中执行表达式（通过 `unsafeWindow.eval()`），直接调用 BOSS 直聘内部 API，利用浏览器已有的登录态和 Cookie
- **结果** 沿原路返回，CLI 输出格式化 JSON

这套架构解决了 Chrome Private Network Access (PNA) 限制：local loopback 请求直接在页面内通过 `GM_xmlhttpRequest` 或原生 `fetch` 发起到 localhost，无需公网中转。

## 快速开始

### 前置条件

- **Node.js >= 18**
- **Tampermonkey** (或 Violentmonkey/Greasemonkey) 浏览器扩展
- **BOSS 直聘账号** 已在浏览器中登录

### 1. 安装依赖

```bash
cd boss-cli
npm install
```

### 2. 配置

```bash
cp config.example.json config.json
```

首次启动服务端时会自动生成 `config.json`（含随机 token），无需手动填写。可配置项：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `bridge.host` | `127.0.0.1` | Bridge Server 监听地址 |
| `bridge.port` | `19425` | Bridge Server 监听端口 |
| `bridge.token` | 自动生成 | CLI 与 Server 之间的认证令牌 |
| `bridge.heartbeatInterval` | `30000` | WebSocket 心跳间隔 (ms) |
| `bridge.heartbeatMaxFailures` | `3` | 心跳失败多少次后断开 |
| `bridge.requestTimeout` | `30000` | eval 请求超时 (ms) |

### 3. 安装油猴脚本

1. 打开 Tampermonkey 管理面板
2. 新建脚本，将 `scripts/boss_zhipin.user.js` 内容粘贴进去
3. 保存（确保 `@match` 匹配 `*://*.zhipin.com/*`）

### 4. 启动 Bridge Server

```bash
# 方式一：直接启动
node server.js

# 方式二：通过管理脚本（支持 start/stop/status/restart）
bash scripts/bridge.sh start
```

### 5. 打开 BOSS 直聘页面

在安装了油猴脚本的浏览器中打开 `https://www.zhipin.com` 任意页面（需已登录）。

### 6. 验证连接

```bash
node cli.js status
```

看到 `zhipin.com` 连接即为正常：

```json
{
  "ok": true,
  "connections": {
    "zhipin.com": [{ "id": "...", "alive": true }]
  },
  "totalConnections": 1
}
```

## 命令参考

所有命令格式: `node cli.js <command> [args...] [--options]`

### 职位搜索

```bash
# 基础搜索
node cli.js search python

# 指定城市（城市代码见 city 命令）
node cli.js search 前端 --city 101010100

# 限制数量
node cli.js search java --limit 10

# 按最低薪资过滤（K/月）
node cli.js search golang --min-salary 20

# 按薪资降序排列
node cli.js search 后端 --sort salary-desc

# 只看 HR 在线
node cli.js search 产品经理 --online

# 排除「面议」
node cli.js search 运营 --no-negotiable

# 组合管线
node cli.js search 数据 --min-salary 15 --sort salary-desc --limit 20 --dedup --enrich
```

### 推荐职位

```bash
node cli.js recommend [--city 101010100] [--page 1]
```

### 职位详情

```bash
node cli.js job <securityId> [--lid <lid>]
```

### 个人/社交

```bash
node cli.js me                  # 当前用户信息
node cli.js friends             # 好友/联系人列表
node cli.js chat --secretId <id>  # 聊天消息历史
node cli.js resume              # 简历完成度
node cli.js expect              # 期望职位列表
```

### 数据/参考

```bash
node cli.js city                # 城市站点数据（含城市代码）
node cli.js filters             # 搜索过滤条件（薪资区间/经验/学历等）
node cli.js industries          # 行业分类
```

### 管线处理

`search` 和 `recommend` 命令支持管线后处理，可在服务器返回结果后进一步过滤和格式化：

| 选项 | 说明 |
|------|------|
| `--min-salary <K>` | 最低月薪过滤（单位 K） |
| `--max-salary <K>` | 最高月薪过滤（单位 K） |
| `--sort salary-desc` | 按最低薪资降序 |
| `--sort salary-asc` | 按最低薪资升序 |
| `--limit <N>` | 限制结果数量 |
| `--dedup` | 按职位 ID 去重 |
| `--enrich` | 薪资结构化解析（附 `_salary` 字段） |
| `--online` | 只看 HR 在线 |
| `--no-negotiable` | 排除「面议」 |
| `--skills <s1,s2>` | 按技能过滤（任意匹配） |

### 全局选项

| 选项 | 说明 |
|------|------|
| `--raw` | 输出原始数据（跳过 transform 精简） |
| `--no-log` | 不写入审计日志 |

## 项目结构

```
boss-cli/
├── cli.js                     # CLI 入口
├── server.js                  # Bridge Server 入口
├── config.example.json        # 配置模板
├── config.json                # 运行时配置（gitignore）
├── site.json                  # 城市站点数据（缓存）
├── package.json
├── scripts/
│   ├── boss_zhipin.user.js    # 油猴脚本（浏览器端）
│   └── bridge.sh              # Bridge Server 生命周期管理
└── lib/
    ├── client/
    │   └── bridge-client.js   # Bridge HTTP 客户端（CLI → Server）
    ├── server/
    │   ├── router.js           # HTTP API 路由 + 认证 + 节流
    │   ├── ws-hub.js          # WebSocket 连接管理 + 心跳
    │   └── registry.js        # 连接注册表（site → connections）
    ├── commands/
    │   ├── index.js            # 命令注册表
    │   ├── helpers.js          # 参数解析 + 常量
    │   ├── search.js           # 搜索（含管线后处理）
    │   ├── job.js              # 职位详情
    │   ├── me.js               # 用户信息
    │   ├── friends.js          # 好友列表
    │   ├── chat.js             # 聊天记录
    │   ├── city.js             # 城市数据
    │   ├── recommend.js        # 推荐职位
    │   ├── filters.js          # 过滤条件
    │   ├── industries.js       # 行业分类
    │   ├── resume.js           # 简历完成度
    │   └── expect.js           # 期望职位
    ├── pipeline/
    │   ├── index.js            # Pipeline 框架（filter/map/sort/enrich/dedup）
    │   ├── filters.js          # 预置过滤器（薪资/技能/城市/公司/状态）
    │   └── enrich.js           # 数据富化（薪资解析/评分）
    ├── output/
    │   └── format.js           # 输出格式化（JSON/Table/CSV/Summary）
    ├── shared/
    │   ├── protocol.js         # 消息类型常量 + 校验
    │   ├── bootstrap.js        # Bridge 自愈代码（共享模块）
    │   └── serialize.js        # 序列化工具
    ├── expression.js           # Expression Builder（安全构建浏览器侧表达式）
    ├── transform.js            # 数据精简层
    ├── jitter.js               # 抖动工具
    └── audit.js                # 审计日志
```

## 核心设计

### Bridge Framework

Bridge Server 作为 CLI 和浏览器之间的代理，解决了两个核心问题：

1. **Chrome PNA (Private Network Access)** — Chrome 限制公网站点向 localhost 发起请求。油猴脚本通过 `GM_xmlhttpRequest` 绕过限制，或通过 WebSocket 建立双工通道。

2. **登录态复用** — API 调用在浏览器页面上下文中执行，自动携带 BOSS 直聘的 Cookie 和 Token，无需在 CLI 中管理登录。

### 通信路径

- **WebSocket (优先)**: 油猴脚本 → `ws://127.0.0.1:19425` → Bridge Server
  - 双向实时通信，低延迟
  - 自带心跳保活 + 断线重连
- **HTTP Polling (兜底)**: 油猴脚本 → `GET /api/poll` → Bridge Server
  - Websocket 不可用时的降级方案

### 节流保护 (P1)

服务端对写操作（`opType='write'`）实施 per-site 最小间隔节流（~47.5s ±15%），防止 Agent 脚本或批量操作因缺少 sleep 而高频请求触发风控。这是结构级保护，无论 CLI 怎么调用都无法突破下限。

### Bridge 自愈

Server 会检测浏览器侧 `window.__bridge` 是否存在；若因页面刷新/SPA 导航丢失，自动在下次 eval 前重新注入，确保 API 调用始终可用。

## API 端点

Bridge Server 暴露以下 HTTP 端点：

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `POST` | `/api/call` | ✅ | 向浏览器派发 eval 表达式 |
| `POST` | `/api/connect` | ✅ | 油猴脚本注册连接 |
| `GET` | `/api/poll` | ✅ | HTTP 轮询（WebSocket 不可用时） |
| `POST` | `/api/result` | ✅ | 油猴脚本返回 eval 结果 |
| `GET` | `/api/health` | ❌ | 健康检查（公开） |
| `GET` | `/api/status` | ❌ | 连接状态（公开） |

## 开发

### 测试

```bash
npm test                 # 运行 vitest 测试套件
```

### 调试

```bash
# 查看原始 API 响应（跳过 transform）
node cli.js search python --raw

# 跳过审计日志
node cli.js search python --no-log

# 查看命令行帮助
node cli.js help
```

## License

MIT
