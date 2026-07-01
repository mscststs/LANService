/**
 * System Controller — 跨平台桌面自动化
 *
 * Linux:   鼠标写入通过 uinput Python helper（绕过 Wayland 限制），读取用 nut.js
 *          键盘用 nut.js
 * Windows/macOS: 全部用 nut.js
 */

const Controller = require('../../template/controller');
const { mouse, keyboard, screen, Key, Button } = require('@nut-tree/nut-js');
const { exec } = require('child_process');
const Store = require('electron-store');
const path = require('path');

const store = new Store();
const mouseSpeed = store.get('mouseSpeed') || 3;
const isLinux = process.platform === 'linux';

// Linux 下延迟加载 uinput 后端（避免非 Linux 平台导入 Python 相关逻辑）
let inputLinux = null;
function getLinuxInput() {
  if (!inputLinux) {
    try {
      inputLinux = require('../../input-linux');
    } catch (e) {
      console.error('[System] Failed to load Linux input backend:', e.message);
      inputLinux = null;
    }
  }
  return inputLinux;
}

// ---- 键名映射 ----

const KEY_MAP = {
  a: Key.A, b: Key.B, c: Key.C, d: Key.D, e: Key.E, f: Key.F, g: Key.G,
  h: Key.H, i: Key.I, j: Key.J, k: Key.K, l: Key.L, m: Key.M, n: Key.N,
  o: Key.O, p: Key.P, q: Key.Q, r: Key.R, s: Key.S, t: Key.T, u: Key.U,
  v: Key.V, w: Key.W, x: Key.X, y: Key.Y, z: Key.Z,
  '0': Key.Num0, '1': Key.Num1, '2': Key.Num2, '3': Key.Num3, '4': Key.Num4,
  '5': Key.Num5, '6': Key.Num6, '7': Key.Num7, '8': Key.Num8, '9': Key.Num9,
  command: Key.LeftSuper, cmd: Key.LeftSuper, super: Key.LeftSuper, win: Key.LeftSuper,
  alt: Key.LeftAlt, option: Key.LeftAlt,
  control: Key.LeftControl, ctrl: Key.LeftControl,
  shift: Key.LeftShift,
  tab: Key.Tab, escape: Key.Escape, esc: Key.Escape,
  enter: Key.Enter, 'return': Key.Enter,
  space: Key.Space, backspace: Key.Backspace, delete: Key.Delete,
  up: Key.Up, down: Key.Down, left: Key.Left, right: Key.Right,
  home: Key.Home, end: Key.End,
  pageup: Key.PageUp, pagedown: Key.PageDown,
  f1: Key.F1, f2: Key.F2, f3: Key.F3, f4: Key.F4,
  f5: Key.F5, f6: Key.F6, f7: Key.F7, f8: Key.F8,
  f9: Key.F9, f10: Key.F10, f11: Key.F11, f12: Key.F12,
  '-': Key.Minus, '=': Key.Equal, '[': Key.LeftBracket, ']': Key.RightBracket,
  '\\': Key.Backslash, ';': Key.Semicolon, '\'': Key.Quote,
  ',': Key.Comma, '.': Key.Period, '/': Key.Slash,
};

function resolveKey(name) {
  const key = KEY_MAP[name.toLowerCase()];
  if (!key) throw new Error('Unknown key: ' + name);
  return key;
}

function resolveKeys(keys) { return keys.map(resolveKey); }

function resolveButton(btn) {
  if (btn === 'right') return Button.RIGHT;
  if (btn === 'middle') return Button.MIDDLE;
  return Button.LEFT;
}

// ---- 获取鼠标位置 & 屏幕尺寸（读操作，nut.js 在 Wayland 可用） ----

async function readMousePos() {
  const pos = await mouse.getPosition();
  const w = await screen.width();
  const h = await screen.height();
  return { x: pos.x, y: pos.y, screenWidth: w, screenHeight: h };
}

// ---- Controller ----

module.exports = class extends Controller {

  async health() {
    const result = { nutjs: 'unknown', uinput: 'unknown', platform: process.platform };
    try {
      const pos = await mouse.getPosition();
      const w = await screen.width();
      const h = await screen.height();
      result.nutjs = 'ok';
      result.mousePos = { x: pos.x, y: pos.y };
      result.screenSize = { width: w, height: h };
    } catch (e) {
      result.nutjs = 'error: ' + e.message;
    }

    if (isLinux) {
      const li = getLinuxInput();
      result.uinput = li && li.isUinputAvailable() ? 'available' : 'unavailable';
    }

    return result;
  }

  async lock() {
    if (process.platform === 'darwin') {
      exec('pmset displaysleepnow');
    } else if (process.platform === 'linux') {
      exec('loginctl lock-session || xdg-screensaver lock || gnome-screensaver-command -l || true');
    } else {
      exec('rundll32.exe user32.dll LockWorkStation');
    }
  }

  async poweroff() {
    if (process.platform === 'darwin') {
      exec('shutdown -h now');
    } else if (process.platform === 'linux') {
      exec('shutdown -h now');
    } else {
      exec('shutdown /p');
    }
  }

  /**
   * 增量移动鼠标
   * Linux: uinput 相对移动
   * 其他: nut.js setPosition
   */
  async pointerMove({ dx = 0, dy = 0 } = {}) {
    const scaledDx = Math.round(dx * mouseSpeed);
    const scaledDy = Math.round(dy * mouseSpeed);

    if (isLinux) {
      const li = getLinuxInput();
      if (li && li.isUinputAvailable()) {
        await li.moveRelative(scaledDx, scaledDy);
        // 短暂等待事件被处理
        await new Promise(r => setTimeout(r, 5));
        return await readMousePos();
      }
    }

    // nut.js fallback
    const pos = await mouse.getPosition();
    const targetX = Math.round(pos.x + scaledDx);
    const targetY = Math.round(pos.y + scaledDy);
    await mouse.setPosition({ x: targetX, y: targetY });

    const newPos = await mouse.getPosition();
    // 检测静默失败
    if (newPos.x === pos.x && newPos.y === pos.y && (scaledDx !== 0 || scaledDy !== 0)) {
      throw new Error('鼠标未能移动。请检查 uinput 权限: sudo chmod 666 /dev/uinput');
    }

    const w = await screen.width();
    const h = await screen.height();
    return { x: newPos.x, y: newPos.y, screenWidth: w, screenHeight: h };
  }

  async mousePos() {
    return await readMousePos();
  }

  /**
   * 鼠标点击
   * Linux: uinput
   * 其他: nut.js
   */
  async click({ btn = 'left', double = false } = {}) {
    if (isLinux) {
      const li = getLinuxInput();
      if (li && li.isUinputAvailable()) {
        await li.click(btn, double);
        return await readMousePos();
      }
    }

    // nut.js fallback
    const button = resolveButton(btn);
    if (double) {
      await mouse.doubleClick(button);
    } else {
      await mouse.click(button);
    }
    return await readMousePos();
  }

  /**
   * 滚动
   * Linux: uinput
   * 其他: nut.js
   */
  async scrollMouse({ x = 0, y = 0 } = {}) {
    const sx = Math.round(x * mouseSpeed);
    const sy = Math.round(y * mouseSpeed);

    if (isLinux) {
      const li = getLinuxInput();
      if (li && li.isUinputAvailable()) {
        // uinput 的 REL_WHEEL 正值 = 向下滚动
        // 前端发来的 y>0 = 向下滚动
        await li.scroll(sx, sy);
        return;
      }
    }

    // nut.js fallback
    if (sy > 0) await mouse.scrollDown(sy);
    else if (sy < 0) await mouse.scrollUp(-sy);
    if (sx > 0) await mouse.scrollRight(sx);
    else if (sx < 0) await mouse.scrollLeft(-sx);
  }

  async shortcut({ keys = [] } = {}) {
    if (keys.length === 0) return;

    // Linux: 使用 uinput（nut.js 键码不兼容）
    if (isLinux) {
      const li = getLinuxInput();
      if (li && li.isUinputAvailable()) {
        await li.keyPress(keys);
        return;
      }
    }

    // nut.js fallback
    const nutKeys = resolveKeys(keys);
    await keyboard.pressKey(...nutKeys);
    await keyboard.releaseKey(...nutKeys);
  }

  async keyTap({ key = '', modifiers = [] } = {}) {
    if (!key && modifiers.length === 0) return;

    // Linux: 使用 uinput
    if (isLinux) {
      const li = getLinuxInput();
      if (li && li.isUinputAvailable()) {
        await li.keyPress([...modifiers, key]);
        return;
      }
    }

    // nut.js fallback
    const allKeys = [...resolveKeys(modifiers), ...(key ? resolveKeys([key]) : [])];
    await keyboard.pressKey(...allKeys);
    await keyboard.releaseKey(...allKeys);
  }

  async log({ msg = '' } = {}) {
    console.log('>', msg);
  }
};
