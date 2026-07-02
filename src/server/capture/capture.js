/**
 * LANService Capture Script
 * 运行在隐藏的 BrowserWindow 中
 *
 * 注意：desktopCapturer 在 Electron 43 渲染进程中不可用，
 * 必须由主进程获取 source ID 后通过 IPC 传入。
 */

const { ipcRenderer } = require('electron');

// ==================== 日志转发 ====================

const _log = console.log, _err = console.error, _warn = console.warn;
function log(lvl, ...args) {
  const msg = args.map(String).join(' ');
  (lvl === 'error' ? _err : lvl === 'warn' ? _warn : _log).apply(console, args);
  try { ipcRenderer.send('capture:log', { level: lvl, message: msg }); } catch(e) {}
}
console.log = (...a) => log('log', ...a);
console.error = (...a) => log('error', ...a);
console.warn = (...a) => log('warn', ...a);

console.log('Capture script loaded');

// ==================== 状态 ====================

let peerConnection = null;
let screenStream = null;
let reconnectTimer = null;
let disconnectCheckTimer = null;
let reconnectAttempts = 0;
let currentSourceId = null;
let streamingInProgress = false;   // 防止并发 startStreaming
let running = false;               // 当前是否有活跃的流
let pendingSourceId = null;        // 排队等待的 sourceId

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;
const CLEANUP_DELAY_MS = 200;     // cleanup 后等待 GPU 释放资源

// ==================== 屏幕捕获 ====================

async function getScreenStream(sourceId) {
  console.log('getUserMedia sourceId:', sourceId);

  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        minWidth: 640,
        maxWidth: 3840,
        minHeight: 480,
        maxHeight: 2160,
      },
    },
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  if (!stream || stream.getVideoTracks().length === 0) {
    throw new Error('getUserMedia returned no video tracks');
  }

  const s = stream.getVideoTracks()[0].getSettings();
  console.log('Screen captured: ' + s.width + 'x' + s.height + ' @' + s.frameRate + 'fps');
  return stream;
}

// ==================== WebRTC ====================

function createPeerConnection() {
  const pc = new RTCPeerConnection({ iceServers: [] });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ipcRenderer.send('capture:ice-candidate', {
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('Connection state: ' + pc.connectionState);
    if (pc.connectionState === 'connected' || pc.connectionState === 'completed') {
      reconnectAttempts = 0;
      ipcRenderer.send('capture:connection-state', 'connected');
    } else if (pc.connectionState === 'failed') {
      console.error('WebRTC failed');
      ipcRenderer.send('capture:connection-state', 'disconnected');
      scheduleReconnect();
    } else if (pc.connectionState === 'disconnected') {
      console.warn('WebRTC disconnected, waiting to confirm...');
      ipcRenderer.send('capture:connection-state', 'disconnected');
      clearTimeout(disconnectCheckTimer);
      disconnectCheckTimer = setTimeout(() => {
        if (peerConnection && peerConnection.connectionState === 'disconnected') {
          scheduleReconnect();
        }
      }, 2000);
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('ICE state: ' + pc.iceConnectionState);
  };

  return pc;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startStreaming(sourceId) {
  // 防止并发调用：排队而不是丢弃
  if (streamingInProgress) {
    console.warn('startStreaming already in progress, queueing sourceId:', sourceId);
    pendingSourceId = sourceId;
    return;
  }
  streamingInProgress = true;

  try {
    cleanup();

    if (!sourceId) {
      console.error('No source ID');
      return;
    }

    currentSourceId = sourceId;

    // Windows 上 GPU 可能还没释放旧捕获资源，延迟后重试
    if (CLEANUP_DELAY_MS > 0) {
      await delay(CLEANUP_DELAY_MS);
    }

    console.log('Starting stream...');
    screenStream = await getScreenStream(sourceId);

    peerConnection = createPeerConnection();

    screenStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, screenStream);
    });

    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });

    await peerConnection.setLocalDescription(offer);

    // 防御：setLocalDescription 成功后 localDescription 可能因竞态为 null
    const sdp = peerConnection.localDescription
      ? peerConnection.localDescription.sdp
      : offer.sdp;
    const type = peerConnection.localDescription
      ? peerConnection.localDescription.type
      : 'offer';

    console.log('Offer ready, SDP length: ' + sdp.length);

    ipcRenderer.send('capture:offer', { sdp, type });

    reconnectAttempts = 0;
    running = true;
  } catch (err) {
    console.error('startStreaming failed: ' + err.message);
    scheduleReconnect();
  } finally {
    streamingInProgress = false;

    // 处理排队的请求
    if (pendingSourceId) {
      const queued = pendingSourceId;
      pendingSourceId = null;
      console.log('Processing queued startStreaming for:', queued);
      startStreaming(queued);
    }
  }
}

function cleanup() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  clearTimeout(disconnectCheckTimer);
  disconnectCheckTimer = null;

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }

  running = false;
}

function scheduleReconnect() {
  if (streamingInProgress) {
    console.log('Skipping reconnect (streaming in progress)');
    return;
  }

  reconnectAttempts++;
  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.error('Max reconnect attempts reached');
    ipcRenderer.send('capture:request-restart');
    reconnectAttempts = 0;
    return;
  }

  console.log('Reconnect ' + reconnectAttempts + '/' + MAX_RECONNECT_ATTEMPTS + ' in ' + RECONNECT_DELAY + 'ms');
  reconnectTimer = setTimeout(() => {
    if (currentSourceId) {
      startStreaming(currentSourceId);
    } else {
      ipcRenderer.send('capture:request-restart');
    }
  }, RECONNECT_DELAY);
}

// ==================== IPC 监听 ====================

ipcRenderer.on('capture:start', (event, sourceInfo) => {
  console.log('Received capture:start, sourceId:', sourceInfo?.sourceId, 'streamingInProgress:', streamingInProgress);
  if (sourceInfo && sourceInfo.sourceId) {
    // 如果正在流中，先强制清理再排队（主进程发了新的 sourceId，说明旧的需要替换）
    if (streamingInProgress) {
      console.log('Force cleanup for new capture:start');
      cleanup();
      streamingInProgress = false;
    }
    startStreaming(sourceInfo.sourceId);
  } else {
    console.error('capture:start missing sourceId');
  }
});

ipcRenderer.on('capture:set-answer', async (event, answer) => {
  try {
    if (!peerConnection) {
      console.warn('No PC for answer');
      return;
    }
    // 如果已经在 stable 状态，说明已经连接，忽略重复 answer
    if (peerConnection.signalingState === 'stable') {
      console.warn('Already in stable state, ignoring duplicate answer');
      return;
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('Remote description set');
  } catch (err) {
    console.error('setRemoteDescription failed: ' + err.message);
    // 如果是错误的 state，触发重连
    if (err.message.includes('wrong state')) {
      console.warn('Wrong state detected, triggering reconnect');
      scheduleReconnect();
    }
  }
});

ipcRenderer.on('capture:add-ice-candidate', async (event, ice) => {
  try {
    if (!peerConnection) return;
    if (!ice || !ice.candidate) return;
    await peerConnection.addIceCandidate(new RTCIceCandidate(ice));
  } catch (err) {
    console.error('addIceCandidate failed: ' + err.message);
  }
});

ipcRenderer.on('capture:stop', () => {
  console.log('Stop signal received');
  cleanup();
});

// ==================== 生命周期 ====================

window.addEventListener('beforeunload', () => {
  cleanup();
});

console.log('=== Capture ready ===');
