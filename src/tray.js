const { app, Menu, Tray } = require('electron');
const Store = require('electron-store');
const store = new Store();
const path = require("path");
const setting = require("./form/index");

const errorIcon = process.platform == "darwin" ? 'assets/service-errorTemplate@4x.png': 'assets/service-error.png';
const connectIcon = process.platform == "darwin" ? 'assets/serviceTemplate@4x.png' :'assets/service.png';

class PathUtils {
  // 将startPath作为标准路径，静态资源的路径和项目中使用到的路径全部由startPath起始
  static startPath = path.join(__dirname, '..');

  static resolvePath = (dirPath) => {
    return path.join(PathUtils.startPath, dirPath || '.');
  };
}

module.exports = class {
  constructor() {
    this.tray = new Tray(PathUtils.resolvePath(connectIcon));
    this.setContextMenu();
    this.setDisconnect();
  }
  async setContextMenu(){
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '偏好设置',
        type: 'normal',
        click: async () => {
          try{
            let res = await setting()
            if(res){
              app.relaunch();
              app.quit();
            }
          }catch(e){
            console.error(e)
          }
        }
      },
      {
        label: '退出',
        type: 'normal',
        click: () => {
          app.quit();
        }
      },
    ]);
    this.tray.setContextMenu(contextMenu);
  }
  setConnect() {
    this.tray.setImage(PathUtils.resolvePath(connectIcon));
    this.tray.setToolTip('服务已启动');
  }
  setDisconnect() {
    this.tray.setImage(PathUtils.resolvePath(errorIcon));
    this.tray.setToolTip('服务未启动');
  }
};
