const Controller = require('../../template/controller');
const session = require('../../session');
const { startCaptureWithSources, notifyClientActivity } = require('../../capture/index');

// offer 等待超时（毫秒）：等待 capture 进程生成 offer 的最长时间
const OFFER_WAIT_TIMEOUT_MS = 10000;
const OFFER_POLL_INTERVAL_MS = 200;

module.exports = class extends Controller {

  /**
   * POST /webrtc/start — 每次都重新建立会话
   * 确保客户端拿到的 offer 对应当前活跃的 PeerConnection
   */
  async start() {
    console.log('[WebRTC Ctrl] Client requested /webrtc/start, creating fresh session');

    // 每次都重置 session 并重新推流，避免旧 offer/旧 PC 导致连接失败
    session.reset();

    try {
      await startCaptureWithSources();
      console.log('[WebRTC Ctrl] Capture restart initiated, waiting for offer...');
    } catch (err) {
      console.error('[WebRTC Ctrl] Failed to restart capture:', err);
      throw new Error('Failed to start capture: ' + err.message);
    }

    // 等待 offer 生成（capture 进程异步生成）
    const offer = await this._waitForOffer();
    if (!offer) {
      console.error('[WebRTC Ctrl] Timeout waiting for offer');
      throw new Error('Timeout waiting for screen capture offer');
    }

    return session.getSessionData();
  }

  /**
   * 等待 offer 生成
   */
  async _waitForOffer() {
    const deadline = Date.now() + OFFER_WAIT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (session.offer) {
        return session.offer;
      }
      await new Promise(r => setTimeout(r, OFFER_POLL_INTERVAL_MS));
    }

    return null;
  }

  /**
   * GET /webrtc/session — 获取当前会话状态（offer + ICE candidates）
   */
  async session(params, body, query) {
    const after = parseInt(query.after) || 0;

    // 客户端在轮询，延长空闲超时
    notifyClientActivity();

    return {
      ...session.getSessionData(),
      newIceCandidates: session.getNewIceCandidates(after),
      iceCandidateCount: session.iceCandidates.length,
    };
  }

  /**
   * POST /webrtc/answer — 移动端发送 answer SDP
   */
  async answer({ sdp, type } = {}) {
    if (!sdp) {
      throw new Error('Missing sdp parameter');
    }

    // 客户端发送 answer，延长空闲超时
    notifyClientActivity();

    const answer = { sdp, type: type || 'answer' };
    session.setAnswer(answer);

    if (global._captureWindow && !global._captureWindow.isDestroyed()) {
      global._captureWindow.webContents.send('capture:set-answer', answer);
    } else {
      console.error('[WebRTC Ctrl] No capture window when setting answer!');
      throw new Error('Capture window not available');
    }

    return { success: true };
  }

  /**
   * POST /webrtc/ice — 移动端发送 ICE candidate
   */
  async ice({ candidate, sdpMid, sdpMLineIndex } = {}) {
    if (!candidate) {
      return { success: true, info: 'empty candidate ignored' };
    }

    // 客户端在交换 ICE，延长空闲超时
    notifyClientActivity();

    const iceCandidate = { candidate, sdpMid, sdpMLineIndex };
    session.addRemoteIceCandidate(iceCandidate);

    if (global._captureWindow && !global._captureWindow.isDestroyed()) {
      global._captureWindow.webContents.send('capture:add-ice-candidate', iceCandidate);
    }

    return { success: true };
  }

  /**
   * GET /webrtc/status — 返回连接状态
   */
  async status() {
    return {
      connected: session.connected,
      hasOffer: !!session.offer,
      hasAnswer: !!session.answer,
      hostIceCount: session.iceCandidates.length,
      remoteIceCount: session.remoteIceCandidates.length,
      sessionId: session.sessionId,
      offerAge: Date.now() - session.createdAt,
    };
  }
};
