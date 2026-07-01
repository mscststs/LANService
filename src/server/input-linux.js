/**
 * Linux uinput 输入后端
 *
 * 通过 Python evdev 守护进程直接写入 /dev/uinput，
 * 绕过 nut.js 在 Wayland 上的键盘键码不兼容问题。
 */

const { spawn } = require('child_process');
const path = require('path');
const { mouse, screen } = require('@nut-tree/nut-js');

let pythonProcess = null;
let ready = false;
let readyWaiters = [];
let responseWaiters = []; // 队列：等待 OK 响应的 resolve 函数

// ---- uinput 进程管理 ----

function getPythonProcess() {
  return new Promise((resolve, reject) => {
    if (pythonProcess && ready) {
      resolve(pythonProcess);
      return;
    }

    if (pythonProcess && !ready) {
      readyWaiters.push(() => resolve(pythonProcess));
      return;
    }

    const scriptPath = path.join(__dirname, 'uinput-helper.py');
    console.log('[InputLinux] Starting uinput helper:', scriptPath);

    pythonProcess = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let buf = '';
    pythonProcess.stdout.on('data', (data) => {
      buf += data.toString();
      const lines = buf.split('\n');
      buf = lines.pop(); // 保留不完整的最后一行

      for (const line of lines) {
        const msg = line.trim();
        if (!msg) continue;

        if (msg === 'READY') {
          console.log('[InputLinux] uinput helper ready ✓');
          ready = true;
          readyWaiters.forEach((w) => w());
          readyWaiters = [];
          resolve(pythonProcess);
        } else if (msg === 'OK' && responseWaiters.length > 0) {
          responseWaiters.shift()();
        } else {
          try {
            const err = JSON.parse(msg);
            if (err.error) {
              console.error('[InputLinux] Error:', err.error);
              if (responseWaiters.length > 0) {
                responseWaiters.shift()(new Error(err.error));
              }
            }
          } catch { /* skip non-JSON */ }
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error('[InputLinux] stderr:', data.toString().trim());
    });

    pythonProcess.on('error', (err) => {
      console.error('[InputLinux] spawn error:', err.message);
      pythonProcess = null;
      ready = false;
      reject(err);
    });

    pythonProcess.on('close', (code) => {
      console.log('[InputLinux] Process exited:', code);
      pythonProcess = null;
      ready = false;
      // 拒绝所有等待者
      while (responseWaiters.length) responseWaiters.shift()();
    });

    setTimeout(() => {
      if (!ready) {
        if (pythonProcess) { pythonProcess.kill(); pythonProcess = null; }
        reject(new Error('uinput helper startup timeout'));
      }
    }, 5000);
  });
}

function sendCommand(cmd) {
  return new Promise(async (resolve) => {
    try {
      const proc = await getPythonProcess();
      responseWaiters.push(resolve);
      proc.stdin.write(JSON.stringify(cmd) + '\n');
      // 超时保护
      setTimeout(() => {
        const idx = responseWaiters.indexOf(resolve);
        if (idx >= 0) { responseWaiters.splice(idx, 1); resolve(); }
      }, 2000);
    } catch (err) {
      console.error('[InputLinux] sendCommand failed:', err.message);
      resolve();
    }
  });
}

function shutdown() {
  if (pythonProcess) {
    try {
      pythonProcess.stdin.write(JSON.stringify({ action: 'quit' }) + '\n');
    } catch (e) { /* ignore */ }
    setTimeout(() => {
      if (pythonProcess) { pythonProcess.kill(); pythonProcess = null; }
    }, 500);
  }
  ready = false;
}

// ---- 公开 API ----

const inputLinux = {
  async moveRelative(dx, dy) {
    if (dx === 0 && dy === 0) return;
    await sendCommand({ action: 'move', dx, dy });
  },

  async click(btn, double) {
    await sendCommand({ action: 'click', btn: btn || 'left', double: !!double });
  },

  async scroll(dx, dy) {
    if (dx === 0 && dy === 0) return;
    await sendCommand({ action: 'scroll', dx, dy });
  },

  /** 组合键（按下全部 → 释放全部） */
  async keyPress(keys) {
    if (!keys || keys.length === 0) return;
    await sendCommand({ action: 'keypress', keys });
  },

  /** 按下不释放 */
  async keyDown(keys) {
    if (!keys || keys.length === 0) return;
    await sendCommand({ action: 'keydown', keys });
  },

  /** 释放 */
  async keyUp(keys) {
    if (!keys || keys.length === 0) return;
    await sendCommand({ action: 'keyup', keys });
  },

  async getMousePos() {
    return await mouse.getPosition();
  },

  async getScreenSize() {
    const w = await screen.width();
    const h = await screen.height();
    return { width: w, height: h };
  },

  isUinputAvailable() {
    try {
      require('fs').accessSync('/dev/uinput', require('fs').constants.W_OK);
      return true;
    } catch { return false; }
  },

  shutdown,
};

module.exports = inputLinux;
