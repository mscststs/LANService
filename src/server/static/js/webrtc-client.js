/**
 * WebRTCClient — 移动端 WebRTC 客户端
 *
 * 负责与信令服务器通信，建立 WebRTC 连接，
 * 接收来自电脑端的屏幕视频流。
 */

class WebRTCClient {
  constructor(options = {}) {
    this.apiBase = options.apiBase || '';
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onStreamReady = options.onStreamReady || (() => {});
    this.onDisconnected = options.onDisconnected || (() => {});

    this.pc = null;
    this.sessionId = null;
    this.connected = false;
    this.connecting = false;
    this.pollTimer = null;
    this.iceCandidateIndex = 0;
    this.stream = null;
  }

  /**
   * 发起连接：创建信令会话，建立 WebRTC
   */
  async connect() {
    if (this.connecting) return;
    this.connecting = true;
    this._setStatus('connecting', '正在连接...');

    try {
      // 1. 创建信令会话
      const session = await this._api('webrtc/start');
      this.sessionId = session.sessionId;
      this.iceCandidateIndex = 0;

      // 2. 创建 RTCPeerConnection
      await this._createPeerConnection();

      // 3. 轮询获取 offer
      await this._pollForOffer();

      // 4. 创建 answer
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // 5. 发送 answer
      await this._api('webrtc/answer', {
        sdp: answer.sdp,
        type: answer.type,
      });

      // 6. 开始 ICE candidate 交换
      this._startIcePolling();

      this.connecting = false;
    } catch (err) {
      console.error('[WebRTCClient] Connection failed:', err);
      this.connecting = false;
      this._setStatus('disconnected', '连接失败: ' + err.message);
      this._scheduleReconnect();
    }
  }

  /**
   * 创建 RTCPeerConnection
   */
  async _createPeerConnection() {
    this.pc = new RTCPeerConnection({
      iceServers: [], // LAN 环境无需 STUN/TURN
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        // 发送 ICE candidate 到信令服务器
        this._api('webrtc/ice', {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        }).catch((err) => {
          console.warn('[WebRTCClient] Failed to send ICE candidate:', err);
        });
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('[WebRTCClient] ICE state:', this.pc.iceConnectionState);
    };

    this.pc.onconnectionstatechange = () => {
      console.log('[WebRTCClient] Connection state:', this.pc.connectionState);
      switch (this.pc.connectionState) {
        case 'connected':
          this.connected = true;
          this._setStatus('connected', '已连接');
          break;
        case 'failed':
        case 'disconnected':
          this.connected = false;
          this._setStatus('disconnected', '连接断开');
          this.onDisconnected();
          this._scheduleReconnect();
          break;
      }
    };

    this.pc.ontrack = (event) => {
      console.log('[WebRTCClient] Track received:', event.track.kind);
      this.stream = event.streams[0];
      this.onStreamReady(this.stream);
      this._setStatus('connected', '已连接');
      this.connected = true;
    };
  }

  /**
   * 轮询获取 offer
   */
  async _pollForOffer() {
    return new Promise((resolve, reject) => {
      const maxAttempts = 60; // 最多等 30 秒
      let attempts = 0;

      const poll = async () => {
        try {
          attempts++;
          const data = await this._api('webrtc/session?after=' + this.iceCandidateIndex);

          if (data.offer) {
            console.log('[WebRTCClient] Offer received');
            await this.pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            resolve();
            return;
          }

          if (attempts >= maxAttempts) {
            reject(new Error('等待 offer 超时'));
            return;
          }

          this.pollTimer = setTimeout(poll, 500);
        } catch (err) {
          reject(err);
        }
      };

      poll();
    });
  }

  /**
   * 开始轮询 host 端 ICE candidates
   */
  _startIcePolling() {
    const poll = async () => {
      if (!this.connected && this.pc && this.pc.connectionState !== 'failed') {
        try {
          const data = await this._api('webrtc/session?after=' + this.iceCandidateIndex);

          if (data.newIceCandidates && data.newIceCandidates.length > 0) {
            for (const ice of data.newIceCandidates) {
              try {
                await this.pc.addIceCandidate(new RTCIceCandidate(ice));
              } catch (err) {
                console.warn('[WebRTCClient] Failed to add ICE candidate:', err);
              }
            }
            this.iceCandidateIndex = data.iceCandidateCount;
          }
        } catch (err) {
          // 静默失败，继续轮询
        }
      }

      if (!this.connected && this.pc) {
        this.pollTimer = setTimeout(poll, 300);
      }
    };

    poll();
  }

  /**
   * 定时重连
   */
  _scheduleReconnect() {
    this.stopPolling();
    setTimeout(() => {
      if (!this.connected && !this.connecting) {
        console.log('[WebRTCClient] Reconnecting...');
        this.cleanup();
        this.connect();
      }
    }, 3000);
  }

  /**
   * 停止轮询
   */
  stopPolling() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.stopPolling();
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.stream = null;
    this.connected = false;
    this.connecting = false;
  }

  /**
   * 销毁
   */
  destroy() {
    this.cleanup();
  }

  /**
   * 调用 API
   */
  async _api(path, data = null) {
    const url = this.apiBase + '/' + path;
    const options = {
      method: data ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
    };
    if (data) {
      options.body = JSON.stringify(data);
    }
    const resp = await fetch(url, options);
    const json = await resp.json();
    return json.data;
  }

  /**
   * 更新状态
   */
  _setStatus(status, text) {
    this.onStatusChange({ status, text });
  }
}

// 暴露到全局
window.WebRTCClient = WebRTCClient;
