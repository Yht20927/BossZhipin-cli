# 贡献指南 (Contributing)

感谢你对 boss-cli 的关注！

## 如何贡献

### 报告 Bug

1. 在 GitHub Issues 中搜索是否已有相同问题
2. 提供详细描述：复现步骤、预期行为、实际行为、环境信息
3. 附上相关日志（`logs/` 目录）

### 提交代码

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 遵循项目代码风格（与周围代码保持一致）
4. 提交前确保 `node cli.js help` 正常输出
5. 提交 Pull Request，描述改动内容和动机

### 项目结构

```
boss-cli/
├── cli.js                     # CLI 入口
├── server.js                  # Bridge Server 入口
├── lib/
│   ├── client/                # Bridge HTTP 客户端
│   ├── server/                # Server 端组件
│   ├── commands/              # CLI 命令实现
│   ├── pipeline/              # 数据管线（过滤/评分/匹配）
│   ├── cache/                 # 结果缓存（@ref 引用系统）
│   ├── llm/                   # LLM 调用封装
│   ├── output/                # 输出格式化与导出
│   ├── shared/                # 共享协议与自愈代码
│   ├── audit.js               # 审计日志
│   ├── expression.js          # 表达式构建器
│   ├── transform.js           # 数据精简层
│   └── jitter.js              # 抖动/延迟工具
├── scripts/
│   └── boss_zhipin.user.js    # 油猴脚本（浏览器端）
└── docs/
    ├── anti-crawling.md       # 反爬知识文档
    └── ...
```

### 添加新命令

1. 在 `lib/commands/` 创建 `<command>.js`
2. 导出 `async function(ctx, args)`
3. 在 `lib/commands/index.js` 注册
4. 在 `cli.js` 添加 `ctx.cmdXxx` 和帮助文本

### 添加新 Pipeline 阶段

1. 在 `lib/pipeline/` 创建模块
2. 导出返回谓词/比较器/富化函数的工厂函数
3. 在命令中通过 `new Pipeline().filter(fn)` 等方式使用

## 行为准则

- 尊重他人
- 建设性讨论
- 不接受任何商业化推广

## License

MIT — 详见 [LICENSE](LICENSE)
