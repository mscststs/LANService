
const { app } = require('electron');
const Tray = require("./src/tray");
const Store = require('electron-store');
const createApp = require("./src/server/index")
const http = require('http');
const { createCaptureWindow, registerIpcHandlers } = require('./src/server/capture/index');
const { checkPermissions } = require('./src/permissions');

app.on("window-all-closed", () => {
  // nothing 不退出
})

// 退出时清理 uinput helper
app.on('will-quit', () => {
  try {
    const inputLinux = require('./src/server/input-linux');
    inputLinux.shutdown();
  } catch (e) { /* ignore */ }
})

Store.initRenderer(); // 为了在 Render 线程使用

// 注册 WebRTC IPC handlers（尽早注册）
registerIpcHandlers();

const store = new Store();
const ip = store.get("ip");
const port = store.get("port");


let tray = null;
let httpServer = null;

app.whenReady().then(async () => {
  // 权限检查
  checkPermissions();

  tray = new Tray();

  if (process.platform === 'darwin') {
    app.dock.hide();
  }


  // 检查是否需要开启本地服务
  if(ip && port){
    try{
      const appCallback = createApp();
      httpServer = http.createServer(appCallback);
      // WebSocket 挂载到同一个 HTTP server
      require('./src/server/ws-server')(httpServer);
      httpServer.listen(port, ip);
      tray.setConnect();

      // 创建隐藏的屏幕捕获窗口
      createCaptureWindow();
    }catch(e){
      console.error(e);
      tray.setDisconnect();
    }
  }

});