#!/usr/bin/env node
// scripts/build-userscript.js — 从 lib/shared/bridge-api.js 生成油猴脚本
//
// __bridge API 定义（含新增的聊天/简历/投递接口）唯一事实源在 lib/shared/bridge-api.js。
// 本脚本把它注入油猴脚本模板，生成 scripts/boss_zhipin.user.js（构建产物）。
// 改 API 后运行一次即可同步 bootstrap 自愈注入与油猴脚本：
//   node scripts/build-userscript.js

const fs = require('fs');
const path = require('path');
const { BRIDGE_API } = require('../lib/shared/bridge-api');

const templatePath = path.join(__dirname, 'userscript.template.js');
const outputPath = path.join(__dirname, 'boss_zhipin.user.js');
const PLACEHOLDER = '__BRIDGE_API__';

const template = fs.readFileSync(templatePath, 'utf8');
if (!template.includes(PLACEHOLDER)) {
  console.error(`[build] 模板 ${path.basename(templatePath)} 中未找到 ${PLACEHOLDER} 占位符`);
  process.exit(1);
}

// JSON.stringify 会把换行/引号安全转义成合法的 JS 字符串字面量
const bridgeApiJson = JSON.stringify(BRIDGE_API);
const output = template.split(PLACEHOLDER).join(bridgeApiJson);

fs.writeFileSync(outputPath, output, 'utf8');
console.log(`[build] ✅ 已生成 scripts/boss_zhipin.user.js`);
console.log(`[build]    bridge-api 大小: ${BRIDGE_API.length} bytes`);
console.log(`[build]    油猴脚本大小:   ${output.length} bytes`);
console.log(`[build]    重新安装到 Tampermonkey 后生效（或刷新 zhipin.com 页面）`);
