const Controller = require('../../template/controller');
const robot = require("@jitsi/robotjs");
const { exec } = require('child_process');
const Store = require('electron-store');
const store = new Store();
const mouseSpeed = store.get("mouseSpeed") || 3;
robot.setMouseDelay(0);


module.exports = class extends Controller {
  async lock(){
    if(process.platform == "darwin"){
      // MACOS
      exec("pmset displaysleepnow")
    }else{
      exec('rundll32.exe user32.dll LockWorkStation');
    }
  }
  async poweroff(){
    if(process.platform == "darwin"){
      // MACOS
      exec("shutdown -h now")
    }else{
      exec('shutdown /p');
    }
  }
  async pointerMove({dx = 0, dy = 0} = {}){
    const mouse = robot.getMousePos();
    dx = dx * mouseSpeed;
    dy = dy * mouseSpeed;
    robot.moveMouse(mouse.x + dx, mouse.y + dy);
  }
  async click({btn = "left", double = false} = {}){
    robot.mouseClick(btn, double);
  }
  async scrollMouse({x = 0, y = 0} = {}){
    x = x * mouseSpeed;
    y = y * mouseSpeed;
    robot.scrollMouse(x, y);
  }
  async log({msg = ""} = {}){
    console.log(">",msg);
  }
};
