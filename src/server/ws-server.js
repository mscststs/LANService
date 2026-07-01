/**
 * WebSocket API Server
 *
 * 与 HTTP API 并行提供低延迟 WebSocket 通道。
 * 所有 mouse/keyboard/system/media 操作优先走 WebSocket。
 *
 * 协议（JSON）：
 *   Request:  {"id": 1, "method": "system/pointerMove", "params": {"dx": 10, "dy": 20}}
 *   Response: {"id": 1, "result": {...}}
 *   Error:    {"id": 1, "error": "message"}
 */

const { WebSocketServer } = require('ws');
const Controller = require('./template/controller');
const requireDirectory = require('require-directory');
const path = require('path');

// 自动发现所有 controller（排除根目录的 controller/index.js）
const controllers = {};
const controllerDir = path.join(__dirname, 'controller');
const rootIndexPath = path.join(controllerDir, 'index.js');
const hash = requireDirectory(module, controllerDir, {
  include: (p) => p !== rootIndexPath && /index\.js$/.test(p),
});
Object.entries(hash).forEach(([key, value]) => {
  if (value.index && typeof value.index === 'function') {
    controllers[key] = value.index;
  }
});
console.log('[WebSocket] Controllers loaded:', Object.keys(controllers).join(', '));

/** 模拟 Koa ctx，让 WebSocket 复用现有 Controller 逻辑 */
function createMockCtx(method, params) {
  const body = method.startsWith('GET') ? {} : (params || {});
  return {
    method: 'POST',
    request: { body },
    query: method.startsWith('GET') ? (params || {}) : {},
    body: null,
    headers: {},
    set: () => {},
    uuid: '',
    env: 'prd',
  };
}

async function handleRequest(method, params) {
  // method 格式: "system/pointerMove", "media/pause", "webrtc/start"
  const [controllerName, modName] = method.split('/');
  if (!controllerName || !modName) {
    throw new Error('Invalid method: ' + method);
  }

  const ControllerClass = controllers[controllerName];
  if (!ControllerClass) {
    throw new Error('Controller not found: ' + controllerName);
  }

  const ctx = createMockCtx(method, params);
  const instance = new ControllerClass(ctx);

  // 调用目标方法
  await instance.call(modName);

  // 从 ctx.body 提取结果
  if (ctx.body && ctx.body.code === 0) {
    return ctx.body.data;
  }
  if (ctx.body && ctx.body.code && ctx.body.code !== 0) {
    throw new Error(ctx.body.msg || 'API error');
  }
  if (ctx.body) {
    return ctx.body;
  }
  return null;
}

function createWSServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  console.log('[WebSocket] Server created');

  wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress;
    console.log('[WebSocket] Client connected:', clientIP);

    ws.on('message', async (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const { id, method, params } = msg;
      if (!method) {
        ws.send(JSON.stringify({ id, error: 'Missing method' }));
        return;
      }

      try {
        const result = await handleRequest(method, params);
        ws.send(JSON.stringify({ id: id || 0, result }));
      } catch (err) {
        ws.send(JSON.stringify({ id: id || 0, error: err.message }));
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected:', clientIP);
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Error:', err.message);
    });

    // 发送欢迎消息
    ws.send(JSON.stringify({ id: 0, result: { connected: true, type: 'welcome' } }));
  });

  return wss;
}

module.exports = createWSServer;
