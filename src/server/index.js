const Koa = require('koa');
const root = require('./router');
const bodyParser = require('koa-bodyparser');
const static = require('koa-static');
const path = require('path');
const createWSServer = require('./ws-server');

function createApp(httpServer) {
  const app = new Koa();

  // 静态资源目录对于相对入口文件index.js的路径
  const staticPath = './static'

  app.use(static(
    path.join( __dirname, staticPath)
  ))

  app.use(bodyParser());

  app.use(root.routes()).use(root.allowedMethods()); // 路由

  // 在同一个 HTTP server 上挂载 WebSocket
  if (httpServer) {
    createWSServer(httpServer);
  }

  return app.callback();
}

module.exports = createApp;
