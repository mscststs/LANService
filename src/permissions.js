/**
 * 权限检查工具
 * 在应用启动时检测 nut.js 桌面自动化所需的系统权限
 *
 * nut.js 通过预编译二进制提供跨平台支持，但仍需系统级权限
 */

const os = require('os');
const fs = require('fs');

function checkPermissions() {
  const platform = os.platform();
  const issues = [];

  console.log('[Permissions] Platform:', platform, '| Release:', os.release());
  console.log('[Permissions] Automation: @nut-tree/nut-js');

  // ---- Linux ----
  if (platform === 'linux') {
    const xdgSessionType = process.env.XDG_SESSION_TYPE || '';
    const display = process.env.DISPLAY || '';
    const waylandDisplay = process.env.WAYLAND_DISPLAY || '';

    console.log('[Permissions] XDG_SESSION_TYPE:', xdgSessionType || '(not set)');
    console.log('[Permissions] DISPLAY:', display || '(not set)');
    console.log('[Permissions] WAYLAND_DISPLAY:', waylandDisplay || '(not set)');

    // nut.js 在 Wayland 下通过 libnut 原生支持，兼容性远好于 robotjs
    if (xdgSessionType === 'wayland') {
      console.log('[Permissions] Wayland detected — nut.js has native Wayland support ✓');
    } else if (display) {
      console.log('[Permissions] X11 detected — nut.js supports X11 ✓');
    } else {
      issues.push(
        '无法检测到 X11 或 Wayland 会话。nut.js 需要图形会话环境。' +
        'DISPLAY=' + (display || '未设置') + ' WAYLAND_DISPLAY=' + (waylandDisplay || '未设置')
      );
    }

    // 检查 uinput
    try {
      fs.accessSync('/dev/uinput', fs.constants.R_OK | fs.constants.W_OK);
      console.log('[Permissions] /dev/uinput: rw ✓');
    } catch (e) {
      issues.push(
        '/dev/uinput 不可读写，键鼠控制将无法工作。一次性修复：\n' +
        '  sudo chmod 666 /dev/uinput\n' +
        '  echo \'KERNEL=="uinput", MODE="0666"\' | sudo tee /etc/udev/rules.d/99-uinput.rules'
      );
    }

    // 检查是否在 input 组
    try {
      const userGroups = require('child_process').execSync('groups', { encoding: 'utf8' });
      if (userGroups.includes('input')) {
        console.log('[Permissions] User in "input" group ✓');
      } else {
        console.log('[Permissions] User NOT in "input" group — run: sudo usermod -a -G input $USER');
      }
    } catch (e) { /* skip */ }

    // 检查 libnut 依赖（nut.js 的底层库）
    try {
      const { execSync } = require('child_process');
      const ldd = execSync('ldd $(find node_modules/@nut-tree/nut-js -name "*.node" 2>/dev/null | head -1) 2>/dev/null || echo "no native addon"', { encoding: 'utf8' });
      console.log('[Permissions] nut.js native addon deps:', ldd.split('\n').filter(l => l.includes('not found')).join(', ') || 'all resolved ✓');
    } catch (e) {
      // 非关键，只是诊断
    }
  }

  // ---- macOS ----
  if (platform === 'darwin') {
    issues.push(
      'macOS: 首次使用键鼠控制时系统会弹出辅助功能权限请求。\n' +
      '请在 系统设置 → 隐私与安全性 → 辅助功能 中授权本应用。'
    );
  }

  // ---- Windows ----
  if (platform === 'win32') {
    console.log('[Permissions] Windows — nut.js should work without extra configuration ✓');
  }

  // ---- 报告 ----
  if (issues.length > 0) {
    console.warn('[Permissions] === ' + issues.length + ' 个潜在问题 ===');
    issues.forEach((issue, i) => {
      console.warn('[Permissions] [' + (i + 1) + '] ' + issue);
    });
    console.warn('[Permissions] ============================');
  } else {
    console.log('[Permissions] 未发现明显问题 ✓');
  }

  return issues;
}

module.exports = { checkPermissions };
