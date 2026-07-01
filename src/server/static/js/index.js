/**
 * LANService v2 — 主应用
 * WebSocket 低延迟通信 + WebRTC 视频流 + 触控面板
 */

// ==================== WebSocket API ====================

const wsApi = new WSApi('ws://' + location.host);

async function api(method, params) {
  return await wsApi.call(method, params);
}

// ==================== Vue 实例 ====================

new Vue({
  el: '#app',
  data: {
    connected: false,
    connecting: true,
    statusText: '正在启动...',

    screenInfo: {
      x: 0, y: 0, screenWidth: 0, screenHeight: 0,
    },

    touchMode: 'pointer',
    touchStartX: 0, touchStartY: 0,
    touchStartA: 0, touchStartB: 0,
    touchActive: false,
    touchStartTime: 0,
    longPressTimer: null,
    showModeIndicator: false,
    modeIndicatorTimer: null,

    systemVolumn: { volume: 0, mute: false },
    showVolumeToast: false,
    volumeToastTimer: null,

    _lastClickTime: 0,
  },

  mounted() {
    this.initWebRTC();
    this.initVolumePolling();
  },

  beforeDestroy() {
    if (this.webrtcClient) this.webrtcClient.destroy();
    wsApi.close();
  },

  methods: {
    // ==================== WebRTC ====================

    initWebRTC() {
      this.webrtcClient = new WebRTCClient({
        apiBase: '',
        onStatusChange: ({ status, text }) => {
          this.statusText = text;
          if (status === 'connected') {
            this.connected = true;
            this.connecting = false;
            this.fetchMousePos();
          } else if (status === 'disconnected') {
            this.connected = false;
            this.connecting = false;
          } else {
            this.connecting = true;
          }
        },
        onStreamReady: (stream) => {
          this.$refs.video.srcObject = stream;
        },
        onDisconnected: () => {
          this.connected = false;
        },
      });
      this.webrtcClient.connect();
    },

    reconnect() {
      this.connecting = true;
      this.statusText = '正在重新连接...';
      this.webrtcClient.cleanup();
      this.webrtcClient.connect();
    },

    onVideoReady() {
      this.fetchMousePos();
    },

    async fetchMousePos() {
      try {
        const pos = await api('system/mousePos');
        if (pos) this.screenInfo = pos;
      } catch (err) { /* 静默 */ }
    },

    // ==================== 触摸事件 ====================

    onTouchStart(e) {
      this.touchActive = true;

      if (e.touches.length === 1) {
        if (this.touchMode === 'scroll') { this.touchMode = 'none'; return; }
        this.touchMode = 'pointer';
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.touchStartTime = Date.now();

        this.longPressTimer = setTimeout(() => {
          if (this.touchActive && this.touchMode === 'pointer') {
            api('system/click', { btn: 'right' });
            if (navigator.vibrate) navigator.vibrate(30);
            this.touchMode = 'none';
          }
        }, 500);

      } else if (e.touches.length === 2) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
        this.touchMode = 'scroll';
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.touchStartA = e.touches[1].clientX;
        this.touchStartB = e.touches[1].clientY;
        this.showModeIndicator = true;
        clearTimeout(this.modeIndicatorTimer);
      }
    },

    onTouchMove(e) {
      e.preventDefault();
      if (this.touchMode === 'pointer' && e.touches.length === 1) {
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const dx = x - this.touchStartX;
        const dy = y - this.touchStartY;
        this.touchStartX = x;
        this.touchStartY = y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }
        this._pointerMove(dx, dy);
      } else if (this.touchMode === 'scroll' && e.touches.length >= 2) {
        const x = e.touches[0].clientX, y = e.touches[0].clientY;
        const a = e.touches[1].clientX, b = e.touches[1].clientY;
        const sx = (x + a) - (this.touchStartX + this.touchStartA);
        const sy = (y + b) - (this.touchStartY + this.touchStartB);
        this.touchStartX = x; this.touchStartY = y;
        this.touchStartA = a; this.touchStartB = b;
        api('system/scrollMouse', { x: sx, y: sy });
      }
    },

    onTouchEnd(e) {
      this.touchActive = false;
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
      const elapsed = Date.now() - this.touchStartTime;

      if (this.touchMode === 'pointer' && elapsed < 300 && e.changedTouches.length === 1) {
        const dx = Math.abs(e.changedTouches[0].clientX - this.touchStartX);
        const dy = Math.abs(e.changedTouches[0].clientY - this.touchStartY);
        if (dx < 5 && dy < 5) {
          const now = Date.now();
          if (this._lastClickTime && (now - this._lastClickTime) < 350) {
            api('system/click', { double: true });
            this._lastClickTime = 0;
            if (navigator.vibrate) navigator.vibrate([20, 50, 20]);
          } else {
            api('system/click');
            this._lastClickTime = now;
            if (navigator.vibrate) navigator.vibrate(10);
          }
        }
      } else if (this.touchMode === 'scroll' && e.touches.length === 0) {
        const dx = Math.abs((e.changedTouches[0]?.clientX || 0) - this.touchStartX);
        const dy = Math.abs((e.changedTouches[0]?.clientY || 0) - this.touchStartY);
        if (dx < 8 && dy < 8) api('system/click', { btn: 'right' });
      }

      if (e.touches.length === 0) {
        this.showModeIndicator = true;
        clearTimeout(this.modeIndicatorTimer);
        this.modeIndicatorTimer = setTimeout(() => { this.showModeIndicator = false; }, 1500);
      }
    },

    async _pointerMove(dx, dy) {
      try {
        const pos = await api('system/pointerMove', { dx, dy });
        if (pos) this.screenInfo = pos;
      } catch (err) { /* 静默 */ }
    },

    // ==================== 模式 / 快捷操作 ====================

    switchTouchMode(mode) {
      this.touchMode = mode;
      this.showModeIndicator = true;
      clearTimeout(this.modeIndicatorTimer);
      this.modeIndicatorTimer = setTimeout(() => { this.showModeIndicator = false; }, 1500);
    },

    quickLeftClick() { api('system/click', { btn: 'left' }); },
    quickRightClick() { api('system/click', { btn: 'right' }); },

    // ==================== 音量 ====================

    async initVolumePolling() { await this.fetchVolume(); },

    async fetchVolume() {
      try {
        const info = await api('media/getVolumeInfo');
        if (info) this.systemVolumn = info;
      } catch (err) { /* 静默 */ }
    },

    async toggleMute() {
      await api(this.systemVolumn.mute ? 'media/notMute' : 'media/mute');
      this.showVolumeToastBriefly();
    },

    showVolumeToastBriefly() {
      this.showVolumeToast = true;
      clearTimeout(this.volumeToastTimer);
      this.volumeToastTimer = setTimeout(() => { this.showVolumeToast = false; }, 1500);
    },

    // ==================== API ====================

    async call(method, data) {
      try {
        const result = await api(method, data);
        if (method.startsWith('media/')) {
          await this.fetchVolume();
          if (method === 'media/volumeUp' || method === 'media/volumeDown') {
            this.showVolumeToastBriefly();
          }
        }
        if (method === 'system/click') await this.fetchMousePos();
        return result;
      } catch (err) {
        console.error('[App] call failed:', method, err.message);
      }
    },

    async dangerCall(method) {
      if (confirm('确定要执行此操作吗？')) await this.call(method);
    },
  },
});
