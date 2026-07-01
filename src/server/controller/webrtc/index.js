const Controller = require('../../template/controller');
const session = require('../../session');
const { startCaptureWithSources } = require('../../capture/index');

// offer 的有效期（毫秒）：超过此时间没有移动端连接，认为需要重新推流
const OFFER_STALE_MS = 60000;

module.exports = class extends Controller {

  /**
   * POST /webrtc/start — 创建/复用会话
   * 如果已有有效 offer 则直接返回，否则触发 capture 重新推流
   */
  async start() {
    const age = Date.now() - session.createdAt;

    // 如果已有 offer 且未过期，直接复用（不重启 capture）
    if (session.offer && age < OFFER_STALE_MS) {
      console.log('[WebRTC Ctrl] Reusing existing offer (age: ' + age + 'ms)');
      return session.getSessionData();
    }

    // 需要新建会话
    console.log('[WebRTC Ctrl] Creating new session (age: ' + age + 'ms)');
    session.reset();

    try {
      await startCaptureWithSources();
      console.log('[WebRTC Ctrl] Capture restart initiated');
    } catch (err) {
      console.error('[WebRTC Ctrl] Failed to restart capture:', err);
    }

    return session.getSessionData();
  }

  /**
   * GET /webrtc/session — 获取当前会话状态（offer + ICE candidates）
   */
  async session(params, body, query) {
    const after = parseInt(query.after) || 0;
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
      this.setErr('缺少 sdp 参数');
      return this.err(-1, 'Missing sdp');
    }

    const answer = { sdp, type: type || 'answer' };
    session.setAnswer(answer);

    if (global._captureWindow && !global._captureWindow.isDestroyed()) {
      global._captureWindow.webContents.send('capture:set-answer', answer);
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
