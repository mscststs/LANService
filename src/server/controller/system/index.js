const Controller = require('../../template/controller');
const robot = require("robotjs");
const { exec } = require('child_process');


module.exports = class extends Controller {
  async lock(){
    exec('rundll32.exe user32.dll LockWorkStation');
  }
  async poweroff(){
    exec('shutdown /p');
  }
};
