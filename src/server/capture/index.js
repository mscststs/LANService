/**
 * Capture Window Manager
 * 在主进程中管理隐藏的屏幕捕获窗口
 *
 * 关键架构：desktopCapturer 必须在主进程调用，
 * 获取到的 source ID 通过 IPC 传给渲染进程，
 * 渲染进程用 source ID 调用 getUserMedia 捕获屏幕。
 */

const { BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const session = require('../session');

let captureWindow = null;

// 调试模式：设置为 true 可显示捕获窗口
const DEBUG_SHOW_WINDOW = false;

/**
 * 创建隐藏的捕获窗口
 */
function createCaptureWindow() {
  if (captureWindow && !captureWindow.isDestroyed()) {
    console.log('[CaptureManager] Window already exists');
    return captureWindow;
  }

  captureWindow = new BrowserWindow({
    width: 640,
    height: 480,
    show: DEBUG_SHOW_WINDOW,
    frame: false,
    skipTaskbar: !DEBUG_SHOW_WINDOW,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  });

  const captureHtmlPath = path.join(__dirname, 'capture.html');
  console.log('[CaptureManager] Loading capture page from:', captureHtmlPath);
  captureWindow.loadFile(captureHtmlPath);

  // 挂到全局以便 webrtc controller 访问
  global._captureWindow = captureWindow;

  // 捕获窗口错误
  captureWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[CaptureManager] Page load failed:', errorCode, errorDescription);
  });

  // 控制台消息（来自 capture.js 的 console.log 等）
  captureWindow.webContents.on('console-message', (event, level, message) => {
    const prefix = ['', '[WARN]', '[ERR]', ''][level] || '[LOG]';
    console.log('[Capture-Renderer]', prefix, message);
  });

  captureWindow.on('closed', () => {
    console.log('[CaptureManager] Window closed');
    global._captureWindow = null;
    captureWindow = null;
  });

  // 窗口加载完成后：获取屏幕源，发送给渲染进程
  captureWindow.webContents.on('did-finish-load', () => {
    console.log('[CaptureManager] Capture window loaded, starting capture...');
    // 延迟确保脚本完全初始化
    setTimeout(() => {
      if (captureWindow && !captureWindow.isDestroyed()) {
        startCaptureWithSources();
      }
    }, 500);
  });

  console.log('[CaptureManager] Capture window created, DEBUG_SHOW_WINDOW:', DEBUG_SHOW_WINDOW);
  return captureWindow;
}

/**
 * 获取屏幕源并通知渲染进程开始捕获
 */
let captureInProgress = false;
const MAX_SOURCE_RETRIES = 3;
const SOURCE_RETRY_DELAYS = [500, 1000, 2000];

async function startCaptureWithSources() {
  if (captureInProgress) {
    console.log('[CaptureManager] Capture already in progress, skipping duplicate call');
    return;
  }
  captureInProgress = true;

  try {
    let sources = [];

    // 重试机制：Windows 上首次调用可能返回空数组
    for (let attempt = 0; attempt <= MAX_SOURCE_RETRIES; attempt++) {
      if (attempt > 0) {
        const waitMs = SOURCE_RETRY_DELAYS[attempt - 1] || 2000;
        console.log('[CaptureManager] Retry', attempt + '/' + MAX_SOURCE_RETRIES + ' after', waitMs + 'ms');
        await new Promise(r => setTimeout(r, waitMs));
      }

      console.log('[CaptureManager] Getting screen sources from desktopCapturer... (attempt', attempt + 1 + ')');
      sources = await desktopCapturer.getSources({
        types: ['screen'],
        // 必须指定 thumbnailSize，否则 Windows 上可能返回空数组
        thumbnailSize: { width: 0, height: 0 },
      });
      console.log('[CaptureManager] Screen sources found:', sources.length);

      if (sources.length > 0) break;
    }

    if (sources.length === 0) {
      console.error('[CaptureManager] No screen sources found after', MAX_SOURCE_RETRIES + 1, 'attempts!');
      return;
    }

    sources.forEach((s, i) => {
      console.log('[CaptureManager]   Source', i + ':', s.name, '| id:', s.id, '| display:', s.display_id);
    });

    // 发送第一个（主）屏幕源给渲染进程
    const source = sources[0];
    console.log('[CaptureManager] Sending screen source to capture window...');
    captureWindow.webContents.send('capture:start', {
      sourceId: source.id,
      sourceName: source.name,
    });
  } catch (err) {
    console.error('[CaptureManager] Failed to get screen sources:', err);
  } finally {
    captureInProgress = false;
  }
}

/**
 * 停止捕获并关闭窗口
 */
function stopCapture() {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.webContents.send('capture:stop');
    captureWindow.close();
    captureWindow = null;
    global._captureWindow = null;
  }
  session.reset();
}

// ==================== 注册 IPC Handlers ====================

function registerIpcHandlers() {
  // 接收来自 capture window 的日志
  ipcMain.on('capture:log', (event, { level, message }) => {
    const prefix = {
      log: '[Capture]',
      warn: '[Capture WARN]',
      error: '[Capture ERROR]',
    }[level] || '[Capture]';
    if (level === 'error') {
      console.error(prefix, message);
    } else if (level === 'warn') {
      console.warn(prefix, message);
    } else {
      console.log(prefix, message);
    }
  });

  // 接收来自 capture window 的 offer
  ipcMain.on('capture:offer', (event, offer) => {
    console.log('[CaptureManager] ========================================');
    console.log('[CaptureManager] Received OFFER from capture window');
    console.log('[CaptureManager] SDP length:', offer.sdp?.length);
    console.log('[CaptureManager] ========================================');
    session.setOffer(offer);
  });

  // 接收来自 capture window 的 ICE candidates
  ipcMain.on('capture:ice-candidate', (event, candidate) => {
    console.log('[CaptureManager] Received ICE candidate from capture window');
    session.addIceCandidate(candidate);
  });

  // 接收连接状态变化
  ipcMain.on('capture:connection-state', (event, state) => {
    console.log('[CaptureManager] Connection state changed:', state);
    session.connected = (state === 'connected');
  });

  // 处理渲染进程请求重新获取屏幕源（当 /webrtc/start 被调用时触发）
  ipcMain.on('capture:request-restart', () => {
    console.log('[CaptureManager] Renderer requested restart, re-fetching sources...');
    startCaptureWithSources();
  });
}

module.exports = {
  createCaptureWindow,
  stopCapture,
  registerIpcHandlers,
  startCaptureWithSources,
};
