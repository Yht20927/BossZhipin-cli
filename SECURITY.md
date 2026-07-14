# 安全策略 (Security)

## 报告漏洞

如果你发现安全漏洞，**请不要在公开 Issue 中披露**。

请通过以下方式私密报告：
- Email: 见仓库所有者 GitHub 主页
- 或在 Issue 中标记为 "Security" 并通过 GitHub 私密报告功能提交

我们会在 48 小时内回应并尽快修复。

## 安全设计

### Bridge Framework

- Bridge Server 仅监听 `127.0.0.1`（本机），不接受外部网络连接
- CLI 与 Server 之间使用随机生成的 Bearer Token 认证
- 油猴脚本在 BOSS 直聘页面上下文中执行，仅调用 BOSS 公开 API
- WebSocket 连接同样限制在 localhost

### 数据安全

- 所有数据存储在本地（`logs/`、`~/.boss/cache/`）
- 不上传任何数据到第三方服务器
- LLM 调用使用用户自行配置的 API Key，不经过项目中转
- 简历文件仅本地读取，不离开用户机器

### 操作安全

- 写操作（打招呼等）内置硬性最小间隔约 48 秒，**无法通过代码绕过**
- 这是结构性保护——无论 CLI 怎么调用都无法突破下限
- 不存储 BOSS 直聘密码（利用浏览器已有的合法登录态）
- dry-run 模式可预览操作效果再决定是否实际执行
- 所有网络通信限制在 localhost，不经过外部中转

## 受支持版本

仅最新版本接受安全更新。

## 依赖

- Node.js >= 18
- ws（WebSocket 库）
- 浏览器 + Tampermonkey 扩展

保持依赖更新：`npm audit` 可检查已知漏洞。
