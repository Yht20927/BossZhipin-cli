# boss-cli — BOSS 直聘 CLI 工具

通过 Bridge Server + 油猴脚本架构，在命令行中操作 [BOSS 直聘](https://www.zhipin.com)，包括搜索职位、智能匹配评分、批量打招呼、LLM 招呼语生成等。

> ⚠️ **重要提示**：本项目内置写操作强制节流（最小间隔约 48 秒），仅用于**个人求职**。禁止用于大规模采集、高频群发或任何违反平台服务条款的行为。详见 [免责声明](DISCLAIMER.md)。

## 架构

```
┌──────────┐   HTTP (JSON)    ┌───────────────┐   WebSocket / HTTP Poll   ┌──────────────────┐
│  cli.js  │ ────────────────> │  Bridge Server │ <──────────────────────── │  油猴脚本 (浏览器)  │
│  (CLI)   │ <──────────────── │  (server.js)   │ ────────────────────────> │  boss_zhipin.user  │
└──────────┘                  └───────────────┘                           └──────────────────┘
   localhost                      localhost:19425                           zhipin.com (含登录态)
```

- **CLI** 将命令编译为 JS 表达式 → Bridge Server → 浏览器 eval → BOSS API
- 所有请求由你已登录的浏览器发起，使用浏览器原生 `fetch`，自动携带已有的 Cookie 和登录态
- 结果经管线后处理（过滤/排序/评分/精简），通过 `@ref` 引用系统节省上下文

## 快速开始

### 前置

- **Node.js >= 18**
- **Tampermonkey** 浏览器扩展
- **BOSS 直聘账号** 已登录

### 安装

```bash
git clone <repo-url> && cd boss-cli
npm install
cp config.example.json config.json
```

### 启动

```bash
# 1. Bridge Server
node server.js &

# 2. 安装油猴脚本 scripts/boss_zhipin.user.js 到 Tampermonkey

# 3. 浏览器打开 zhipin.com 任意页面

# 4. 验证
node cli.js status
# → totalConnections >= 1 即正常
```

## 命令参考

### 职位发现

```bash
node cli.js search <keyword> [options]
    --city <code>           城市代码 (node cli.js city)
    --pages N --interval 秒  批量翻页搜索
    --min-salary K           最低月薪 (K)
    --sort salary-desc       按薪资排序
    --limit N --dedup        限制数量 + 去重
    --enrich                 薪资结构化
    --online --no-negotiable HR在线 / 排除面议
    --save csv|jsonl|db      导出结果

node cli.js recommend [--city <code>]
```

### 匹配评分

```bash
# 命令行快速评分
node cli.js search python \
    --match-skills "Python,FastAPI,PostgreSQL" \
    --match-min-salary 15 \
    --match-cities "北京,上海,深圳" \
    --sort match-score

# JSON 配置文件
node cli.js search python --match-profile my-profile.json
```

### 打招呼

```bash
# 搜索 + 批量打招呼（写操作自动节流约 48s/条）
node cli.js greet-batch python --city 101290100 --count 10 --min-salary 10

# 预览（强烈建议先预览）
node cli.js greet-batch python --count 5 --dry-run

# 从缓存引用打招呼
node cli.js greet-batch --refs @search-xxx:1,@search-xxx:3

# 单条打招呼
node cli.js contact <securityId> --jobId <id>
node cli.js contact @search-xxx:2    # 用 @ref 引用
```

### LLM 招呼语

```bash
export LLM_API_KEY=sk-xxx
export LLM_BASE_URL=https://api.deepseek.com
export LLM_MODEL=deepseek-chat

node cli.js llm-greet <securityId|@ref> --jobId <id> --resume cv.txt
node cli.js llm-greet @search-xxx:1 --dry-run   # 预览不发送
node cli.js llm-stats                            # LLM 调用统计
```

### 个人/社交

```bash
node cli.js me                 # 用户信息
node cli.js friends            # 好友列表
node cli.js chat --secretId <id> | @ref  # 聊天历史
node cli.js resume             # 简历完成度
node cli.js expect             # 期望职位
```

### 数据/参考

```bash
node cli.js city               # 城市代码
node cli.js filters            # 搜索过滤条件
node cli.js industries         # 行业分类
```

### 系统

```bash
node cli.js status             # Bridge 连接状态
node cli.js refresh            # 刷新会话（修复 code:37）
node cli.js token info         # 查看 passport_config 缓存
node cli.js token gen          # 生成 __zp_stoken__
node cli.js cache list         # 结果缓存列表
node cli.js cache clean        # 清理过期缓存
```

## @ref 引用系统

搜索/推荐/好友结果自动缓存到 `~/.boss/cache/`，输出中长 ID 替换为精确引用：

```json
{
  "_invId": "search-260714-131522-a3f2",
  "jobList": [
    { "jobName": "Python工程师", "salaryDesc": "15-25K", "_ref": "@search-260714-131522-a3f2:1" }
  ]
}
```

下游命令直接使用 `@invId:N` 引用，无需复制粘贴长 ID：

```bash
node cli.js job @search-260714-131522-a3f2:1
node cli.js contact @search-260714-131522-a3f2:3
```

**输出体积对比**：15 个岗位从 ~12KB → ~4KB，节省 ~65%。

## 管线选项速查

| 选项 | 说明 |
|------|------|
| `--min-salary <K>` | 最低月薪过滤 |
| `--sort salary-desc\|asc` | 薪资排序 |
| `--sort match-score` | 按匹配度排序 |
| `--limit <N>` | 限制数量 |
| `--dedup` | 去重 |
| `--enrich` | 薪资结构化 |
| `--online` | HR 在线 |
| `--no-negotiable` | 排除面议 |
| `--skills s1,s2` | 技能过滤 |
| `--pages N` | 批量翻页 |
| `--interval 秒` | 翻页间隔 |
| `--save csv\|jsonl\|db` | 导出 |
| `--no-cache` | 不使用缓存（输出含完整 ID） |
| `--raw` | 原始输出 |
| `--no-log` | 不写审计日志 |

## LLM 配置

| 环境变量 | 说明 | 默认 |
|----------|------|------|
| `LLM_API_KEY` | API Key（必填） | - |
| `LLM_BASE_URL` | 端点 URL | `https://api.openai.com/v1` |
| `LLM_MODEL` | 模型名 | `gpt-4o-mini` |

支持任意 OpenAI 兼容端点：DeepSeek / OpenAI / Claude / 通义千问 / Ollama …

## 项目结构

```
boss-cli/
├── cli.js                     # CLI 入口
├── server.js                  # Bridge Server
├── scripts/
│   └── boss_zhipin.user.js    # 油猴脚本
├── lib/
│   ├── client/                # Bridge HTTP 客户端
│   ├── server/                # WebSocket + Router + Registry
│   ├── commands/              # 命令实现 (17个)
│   ├── pipeline/              # 管线 (filter/sort/enrich/match/semantic)
│   ├── cache/                 # 结果缓存 + @ref 系统
│   ├── llm/                   # LLM 调用封装
│   ├── output/                # 格式化 + CSV/SQLite 导出
│   ├── shared/                # 协议 + 自愈代码
│   └── audit.js               # 审计日志 + LLM Telemetry
└── docs/
    └── platform-notes.md      # 平台使用说明
```

## 文档

- [DISCLAIMER.md](DISCLAIMER.md) — 免责声明
- [CONTRIBUTING.md](CONTRIBUTING.md) — 贡献指南
- [SECURITY.md](SECURITY.md) — 安全策略
- [SKILL.md](SKILL.md) — AI Agent 使用说明
- [docs/platform-notes.md](docs/platform-notes.md) — 平台使用说明

## License

MIT — 详见 [LICENSE](LICENSE)
