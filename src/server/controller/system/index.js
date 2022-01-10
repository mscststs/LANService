const Controller = require('../../template/controller');
const robot = require("robotjs");
const { exec } = require('child_process');


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
};
