/**
 * WebRTC 信令会话存储
 * 在主进程和 Koa controller 之间共享状态
 */
const crypto = require('crypto');

class SignalingSession {
  constructor() {
    this.reset();
  }

  reset() {
    this.sessionId = crypto.randomUUID();
    this.offer = null;
    this.answer = null;
    this.iceCandidates = [];       // 来自 capture window (host)
    this.remoteIceCandidates = []; // 来自 mobile client
    this.connected = false;
    this.createdAt = Date.now();
  }

  setOffer(offer) {
    this.offer = offer;
  }

  addIceCandidate(candidate) {
    this.iceCandidates.push(candidate);
  }

  setAnswer(answer) {
    this.answer = answer;
  }

  addRemoteIceCandidate(candidate) {
    this.remoteIceCandidates.push(candidate);
  }

  getNewIceCandidates(afterIndex) {
    return this.iceCandidates.slice(afterIndex);
  }

  getNewRemoteIceCandidates(afterIndex) {
    return this.remoteIceCandidates.slice(afterIndex);
  }

  getSessionData() {
    return {
      sessionId: this.sessionId,
      offer: this.offer,
      iceCandidates: this.iceCandidates,
      connected: this.connected,
      createdAt: this.createdAt,
    };
  }
}

// 单例
const session = new SignalingSession();

module.exports = session;
