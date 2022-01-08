const Router = require('koa-router');
const mountController = require('../controller');
const root = new Router();

// 挂载
mountController(root);

root.get('/', async (ctx) => {
  ctx.body = 'OK';
});

root.get('/ping', async (ctx) => {
  ctx.body = 'pong';
});

/**
 * 404 兜底处理
 */
root.get('(.*)', async (ctx) => {
  ctx.body = ctx.addons;
  ctx.status = 404;
});

module.exports = root;
