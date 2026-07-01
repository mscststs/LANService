/**
 * WebSocket API Client — 低延迟 RPC 客户端
 *
 * 替代 HTTP fetch，所有 mouse/keyboard/system/media 操作
 * 通过持久 WebSocket 连接发送，消除 HTTP 开销。
 *
 * 用法：
 *   const result = await wsApi.call('system/pointerMove', { dx: 10, dy: 20 });
 */

class WSApi {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.id = 0;
    this.pending = new Map(); // id → { resolve, reject }
    this.connected = false;
    this.reconnectTimer = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      console.log('[WSApi] Connecting to', this.url);
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WSApi] Connected ✓');
        this.connected = true;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const { id, result, error } = msg;

          // 欢迎消息（id: 0）
          if (id === 0 && result && result.type === 'welcome') {
            return;
          }

          const waiter = this.pending.get(id);
          if (!waiter) return;

          this.pending.delete(id);
          if (error) {
            waiter.reject(new Error(error));
          } else {
            waiter.resolve(result);
          }
        } catch (e) {
          console.warn('[WSApi] Bad message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[WSApi] Disconnected');
        this.connected = false;
        // 拒绝所有待处理请求
        this.pending.forEach((w) => w.reject(new Error('Connection closed')));
        this.pending.clear();
        // 自动重连
        this._scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[WSApi] Error:', err);
        if (!this.connected) {
          reject(new Error('WebSocket connection failed'));
        }
      };
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[WSApi] Reconnecting...');
      this.connect();
    }, 2000);
  }

  /**
   * 调用远程方法
   * @param {string} method - "system/pointerMove"
   * @param {object} params - 参数
   * @returns {Promise<any>}
   */
  async call(method, params) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });

      const msg = JSON.stringify({ id, method, params: params || {} });
      this.ws.send(msg);

      // 超时保护
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Request timeout: ' + method));
        }
      }, 5000);
    });
  }

  close() {
    this.connected = false;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

window.WSApi = WSApi;
