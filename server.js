#!/usr/bin/env node
// server.js — BOSS Bridge Server 入口

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { ConnectionRegistry } = require('./lib/server/registry');
const { WebSocketHub } = require('./lib/server/ws-hub');
const { Router } = require('./lib/server/router');

// 加载配置
const configPath = path.join(__dirname, 'config.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  if (e.code === 'ENOENT') {
    console.error('[server] 未找到 config.json，请先复制 config.example.json 并填写配置：');
    console.error('[server]   cp config.example.json config.json');
  } else {
    console.error('[server] config.json 格式错误，请检查 JSON 语法：', e.message);
  }
  process.exit(1);
}

// 自动生成 token
if (!config.bridge?.token) {
  config.bridge.token = crypto.randomBytes(24).toString('hex');
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    console.error('[server] 已自动生成 access token 并写入 config.json');
  } catch (e) {
    console.error('[server] 无法写入 config.json:', e.message);
  }
}

// 初始化组件
const registry = new ConnectionRegistry();
const wsHub = new WebSocketHub({
  registry,
  port: config.bridge?.port || 19425,
  host: config.bridge?.host || '127.0.0.1',
  heartbeatInterval: config.bridge?.heartbeatInterval,
  heartbeatTimeout: config.bridge?.heartbeatTimeout,
  heartbeatMaxFailures: config.bridge?.heartbeatMaxFailures,
});
const router = new Router({
  registry,
  wsHub,
  requestTimeout: config.bridge?.requestTimeout || 30000,
  token: config.bridge?.token || '',
});

// 创建 HTTP Server
const httpServer = http.createServer((req, res) => {
  router.handle(req, res);
});

// 将 WebSocket attach 到 HTTP Server
wsHub.attach(httpServer);

// 启动监听
const bridgeHost = config.bridge?.host || '127.0.0.1';
const bridgePort = config.bridge?.port || 19425;
httpServer.listen(bridgePort, bridgeHost, () => {
  console.error(`[server] BOSS Bridge Server ready — http://${bridgeHost}:${bridgePort}`);
  console.error(`[server] Health:  http://${bridgeHost}:${bridgePort}/api/health`);
  console.error(`[server] Status:  http://${bridgeHost}:${bridgePort}/api/status`);
  console.error('[server] Waiting for Tampermonkey scripts to connect...');
});

// 优雅退出
async function shutdown() {
  console.error('\n[server] Shutting down...');
  httpServer.close();
  await wsHub.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
