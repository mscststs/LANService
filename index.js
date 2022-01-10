
const { app } = require('electron');
const Tray = require("./src/tray");
const Store = require('electron-store');
const createApp = require("./src/server/index")
const http = require('http');

app.on("window-all-closed", () => {
  // nothing 不退出
})

Store.initRenderer(); // 为了在 Render 线程使用

const store = new Store();
const ip = store.get("ip");
const port = store.get("port");


let tray = null;
let httpServer = null;

app.whenReady().then(async () => {
  tray = new Tray();

  if (process.platform === 'darwin') {
    app.dock.hide();
  }


  // 检查是否需要开启本地服务
  if(ip && port){
    try{ 
      httpServer = http.createServer(createApp());
      httpServer.listen(port, ip);
      tray.setConnect();
    }catch(e){
      console.error(e);
      tray.setDisconnect();
    }
  }

});