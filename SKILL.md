# boss-cli · AI Agent Skill

> 你是 AI Agent。这份文档让你 60 秒上手 boss-cli，帮求职者操作 BOSS 直聘。

## 1. 项目本质

`boss-cli` 通过 **Bridge Server + 油猴脚本** 架构，让 CLI 驱动浏览器发起 BOSS 直聘 API 调用。

```
CLI ──HTTP──▶ Bridge Server (:19425) ──WS/HTTP Poll──▶ 浏览器 (油猴脚本) ──fetch──▶ BOSS API
```

所有请求由**真实浏览器**发出（带真 TLS / Cookie / UA），反爬看不出来。

## 2. 前置条件

- Node.js >= 18
- 浏览器 + Tampermonkey 扩展
- BOSS 直聘账号已登录
- Bridge Server 运行中：`node server.js`
- 油猴脚本 `scripts/boss_zhipin.user.js` 已安装并运行

验证：`node cli.js status` → 看到 `zhipin.com` 连接即为正常。

## 3. 命令速查

### 职位发现

```bash
node cli.js search <keyword> [--city <code>] [--pages N] [--interval 秒]
    --min-salary <K>      最低月薪(K)
    --sort salary-desc    按薪资降序
    --limit N             限制数量
    --dedup               去重
    --enrich              薪资结构化
    --online              HR 在线
    --no-negotiable       排除面议
    --skills s1,s2        技能过滤
    --match-skills s1,s2  匹配评分（技能维度）
    --match-profile <json> 配置文件匹配评分
    --match-min-salary <K> 匹配评分（薪资维度）
    --match-cities c1,c2   匹配评分（城市维度）
    --save csv|jsonl|db    导出结果
    --no-cache            输出含完整ID

node cli.js recommend [--city <code>] [--page N]
    推荐职位列表（15条/页）
```

### 职位操作

```bash
node cli.js job <securityId|@inv:N>            # 职位详情
node cli.js contact <securityId|@inv:N>        # 发送沟通请求
node cli.js greet-batch <keyword>              # 搜索+批量打招呼
    --count N --min-salary K --dry-run --interval 秒
node cli.js greet-batch --refs @inv1:1,@inv2:3 # 从缓存批量打招呼
node cli.js llm-greet <securityId|@inv:N>      # LLM 招呼语
    --jobId <id> --resume <path> --dry-run
```

### 个人/社交

```bash
node cli.js me                    # 用户信息
node cli.js friends               # 好友列表（支持 @ref）
node cli.js chat --secretId <id>  # 聊天历史（支持 @ref）
node cli.js resume                # 简历完成度
node cli.js expect                # 期望职位
```

### 数据/参考

```bash
node cli.js city          # 城市代码
node cli.js filters       # 搜索过滤条件
node cli.js industries    # 行业分类
```

### 系统

```bash
node cli.js status        # 连接状态
node cli.js refresh       # 刷新会话（修复 code:37）
node cli.js token info    # 查看 token 缓存
node cli.js token gen     # 生成 __zp_stoken__
node cli.js llm-stats     # LLM 调用统计
node cli.js cache list    # 结果缓存列表
node cli.js cache clean   # 清理过期缓存
```

## 4. 常用工作流

### 找工作

```bash
# 1. 搜索职位（自动缓存，输出含 @ref）
node cli.js search python --city 101290100 --min-salary 10 --sort salary-desc --limit 15

# 2. 看详情（用 @ref 引用）
node cli.js job @search-260714-131522-a3f2:3

# 3. 批量投递
node cli.js greet-batch python --city 101290100 --count 10 --min-salary 10
```

### 出 code:37 了

```bash
node cli.js refresh
# 等几秒，浏览器自动跳转 + token 刷新 + 重连
node cli.js search ...  # 继续
```

### 批量打招呼（从缓存）

```bash
# 先搜索
node cli.js search python --limit 10

# 记下 _invId，挑选要投的
node cli.js greet-batch --refs @inv1:1,@inv1:3,@inv1:5,@inv1:7
```

### LLM 招呼语

```bash
export LLM_API_KEY=sk-xxx
export LLM_BASE_URL=https://api.deepseek.com
export LLM_MODEL=deepseek-chat

node cli.js llm-greet @search-xxx:1 --jobId <id> --resume resume.txt --dry-run
# 满意后去掉 --dry-run
```

## 5. 匹配评分系统

创建 `my-profile.json`：
```json
{
  "skills": ["Python", "FastAPI", "PostgreSQL"],
  "minSalary": 15,
  "preferredCities": ["北京", "上海"],
  "preferredScales": ["500-999人", "1000-9999人"],
  "preferredIndustries": ["互联网", "人工智能"],
  "excludeCompanies": ["外包", "驻场"]
}
```

```bash
node cli.js search python --match-profile my-profile.json --sort match-score --limit 20
```

输出中每个职位有 `_match: { score, grade, dimensions }` 评分。

## 6. 故障排查

```bash
# 1. Server 在跑吗？
node cli.js status

# 2. 连接正常吗？（应该有连接）
# totalConnections == 0 → 刷新浏览器 BOSS 页面

# 3. code:37？
node cli.js refresh

# 4. 超时？
# 检查浏览器是否打开了 BOSS 页面且油猴脚本在运行
# 试着 node cli.js me → 如果成功则连接正常

# 5. 搜索返回空？
# city 代码是否正确：node cli.js city
# 可能 token 过期：node cli.js refresh
```

## 7. 你绝不要做的事

- ❌ 不要让用户用此项目做大规��采集、攻击、商业爬虫
- ❌ 不要帮用户高频群发——写操作自动节流 ~50s，这是保护机制
- ❌ 不要绕过 `--dry-run` 直接批量投递——让用户先预览
- ❌ 不要泄露用户的 API Key、简历内容、聊天记录

## 8. 架构笔记

```
cli.js → Bridge Server → 浏览器 (eval JS) → BOSS API
                              ↑
                         油猴脚本注入 __bridge API
                         所有 fetch 带真实 Cookie/TLS
```

- **写操作节流**：Server 端 P1 结构性保护，per-site 最小间隔 ~47.5s
- **结果缓存**：搜索/推荐/好友输出自动缓存到 `~/.boss/cache/`，输出中用 `@inv:N` 替代长 ID，节省 65% 上下文
- **Bridge 自愈**：Server 检测 `window.__bridge` 丢失自动重新注入
- **WebSocket 优先**：油猴脚本优先 WS 通信，不可用时回退 HTTP 轮询

## 9. 关键文件

```
cli.js              # CLI 入口 + 帮助
server.js           # Bridge Server
lib/commands/       # 所有命令实现
lib/pipeline/       # 数据管线 (filter/sort/enrich/match)
lib/cache/          # 结果缓存 + @ref 系统
lib/llm/            # LLM 调用封装
lib/shared/         # Bootstrap + 协议
scripts/            # 油猴脚本
docs/               # 反爬文档
```
