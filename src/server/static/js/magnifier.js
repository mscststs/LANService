/**
 * Magnifier — Canvas 放大镜
 *
 * 在视频流上显示鼠标位置周围的放大区域。
 * 使用 Canvas 从视频帧中裁剪并放大。
 */

class Magnifier {
  constructor(canvas, videoElement, options = {}) {
    this.canvas = canvas;
    this.video = videoElement;
    this.ctx = canvas.getContext('2d');

    this.size = options.size || 130;           // 放大镜显示尺寸 (px)
    this.zoomLevel = options.zoom || 3;         // 放大倍率
    this.sourceSize = this.size / this.zoomLevel; // 源区域大小

    this.screenWidth = 1920;
    this.screenHeight = 1080;
    this.mouseX = 0;
    this.mouseY = 0;
    this.visible = false;

    // 动画帧 ID
    this.rafId = null;

    // 触摸面板的 DOM 元素引用（用于定位）
    this.panelEl = null;

    this.canvas.width = this.size;
    this.canvas.height = this.size;
  }

  /**
   * 设置屏幕尺寸（用于坐标映射）
   */
  setScreenSize(width, height) {
    this.screenWidth = width;
    this.screenHeight = height;
  }

  /**
   * 更新鼠标/触摸在屏幕上的位置
   */
  updateScreenPosition(screenX, screenY) {
    this.mouseX = Math.max(0, Math.min(screenX, this.screenWidth));
    this.mouseY = Math.max(0, Math.min(screenY, this.screenHeight));
  }

  /**
   * 设置触摸面板元素引用
   */
  setPanelElement(el) {
    this.panelEl = el;
  }

  /**
   * 根据触摸在面板上的位置，更新放大镜显示位置（不遮挡手指）
   */
  updatePanelPosition(touchClientX, touchClientY) {
    if (!this.panelEl) return;

    const panelRect = this.panelEl.getBoundingClientRect();
    const panelX = touchClientX - panelRect.left;
    const panelY = touchClientY - panelRect.top;

    // 将放大镜放在触摸点上方偏右的位置（不遮挡手指）
    let magX = panelX + 20;
    let magY = panelY - this.size - 30;

    // 边界检查
    if (magX + this.size > panelRect.width) {
      magX = panelX - this.size - 20;
    }
    if (magY < 0) {
      magY = panelY + 30;
    }
    if (magX < 0) {
      magX = 10;
    }

    this.canvas.style.left = magX + 'px';
    this.canvas.style.top = magY + 'px';
  }

  /**
   * 显示放大镜
   */
  show() {
    this.visible = true;
    this.canvas.classList.add('visible');
    this._startDrawing();
  }

  /**
   * 隐藏放大镜
   */
  hide() {
    this.visible = false;
    this.canvas.classList.remove('visible');
    this._stopDrawing();
  }

  /**
   * 设置放大倍率
   */
  setZoom(level) {
    this.zoomLevel = Math.max(1.5, Math.min(6, level));
    this.sourceSize = this.size / this.zoomLevel;
  }

  /**
   * 开始绘制循环
   */
  _startDrawing() {
    if (this.rafId) return;
    const draw = () => {
      if (!this.visible) {
        this._stopDrawing();
        return;
      }
      this._draw();
      this.rafId = requestAnimationFrame(draw);
    };
    draw();
  }

  /**
   * 停止绘制循环
   */
  _stopDrawing() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * 绘制放大镜内容
   */
  _draw() {
    if (!this.video || this.video.readyState < 2) return;

    const ctx = this.ctx;
    const size = this.size;
    const halfSize = size / 2;
    const srcHalf = this.sourceSize / 2;

    // 视频的显示尺寸
    const videoDisplayWidth = this.video.clientWidth;
    const videoDisplayHeight = this.video.clientHeight;
    const videoActualWidth = this.video.videoWidth || this.screenWidth;
    const videoActualHeight = this.video.videoHeight || this.screenHeight;

    if (videoDisplayWidth === 0 || videoDisplayHeight === 0) return;

    // 计算鼠标在视频帧中的像素位置
    const scaleX = videoActualWidth / this.screenWidth;
    const scaleY = videoActualHeight / this.screenHeight;

    // 视频在容器中的实际渲染区域（object-fit: contain）
    const videoAspect = videoActualWidth / videoActualHeight;
    const containerAspect = videoDisplayWidth / videoDisplayHeight;

    let renderWidth, renderHeight, offsetX, offsetY;

    if (videoAspect > containerAspect) {
      // 视频更宽，上下留黑边
      renderWidth = videoDisplayWidth;
      renderHeight = videoDisplayWidth / videoAspect;
      offsetX = 0;
      offsetY = (videoDisplayHeight - renderHeight) / 2;
    } else {
      // 视频更高，左右留黑边
      renderHeight = videoDisplayHeight;
      renderWidth = videoDisplayHeight * videoAspect;
      offsetX = (videoDisplayWidth - renderWidth) / 2;
      offsetY = 0;
    }

    // 屏幕坐标 → 视频帧坐标
    const srcX = (this.mouseX / this.screenWidth) * videoActualWidth;
    const srcY = (this.mouseY / this.screenHeight) * videoActualHeight;

    // 清除画布
    ctx.clearRect(0, 0, size, size);

    // 绘制圆形裁剪区域
    ctx.save();
    ctx.beginPath();
    ctx.arc(halfSize, halfSize, halfSize - 3, 0, Math.PI * 2);
    ctx.clip();

    // 从视频中裁剪放大区域并绘制
    ctx.drawImage(
      this.video,
      srcX - srcHalf, srcY - srcHalf,
      this.sourceSize, this.sourceSize,
      0, 0,
      size, size
    );

    ctx.restore();

    // 绘制十字准星
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.9)';
    ctx.lineWidth = 1.5;

    // 水平线
    ctx.beginPath();
    ctx.moveTo(halfSize - 10, halfSize);
    ctx.lineTo(halfSize - 4, halfSize);
    ctx.moveTo(halfSize + 4, halfSize);
    ctx.lineTo(halfSize + 10, halfSize);
    ctx.stroke();

    // 垂直线
    ctx.beginPath();
    ctx.moveTo(halfSize, halfSize - 10);
    ctx.lineTo(halfSize, halfSize - 4);
    ctx.moveTo(halfSize, halfSize + 4);
    ctx.lineTo(halfSize, halfSize + 10);
    ctx.stroke();

    // 中心点
    ctx.fillStyle = 'rgba(255, 50, 50, 0.9)';
    ctx.beginPath();
    ctx.arc(halfSize, halfSize, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 外圈装饰
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(halfSize, halfSize, halfSize - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// 暴露到全局
window.Magnifier = Magnifier;
