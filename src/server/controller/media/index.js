const Controller = require('../../template/controller');
const { keyboard, Key } = require('@nut-tree/nut-js');
const loudness = require('loudness');

const isLinux = process.platform === 'linux';

function getLinuxInput() {
  try { return require('../../input-linux'); } catch { return null; }
}

module.exports = class extends Controller {

  async _mediaKey(keyName) {
    if (isLinux) {
      const li = getLinuxInput();
      if (li && li.isUinputAvailable()) {
        await li.keyPress([keyName]);
        return;
      }
    }
    // nut.js fallback
    const keyMap = {
      pause: Key.AudioPause,
      stop: Key.AudioStop,
      prev: Key.AudioPrev,
      next: Key.AudioNext,
    };
    const key = keyMap[keyName];
    if (key) {
      await keyboard.pressKey(key);
      await keyboard.releaseKey(key);
    }
  }

  async pause() { await this._mediaKey('pause'); }
  async stop() { await this._mediaKey('stop'); }
  async prev() { await this._mediaKey('prev'); }
  async next() { await this._mediaKey('next'); }

  async volumeDown() {
    await loudness.setVolume(await loudness.getVolume() - 5);
  }
  async volumeUp() {
    await loudness.setVolume(await loudness.getVolume() + 5);
  }
  async mute() {
    await loudness.setMuted(true);
  }
  async notMute() {
    await loudness.setMuted(false);
  }

  async getVolumeInfo() {
    return {
      volume: await loudness.getVolume(),
      mute: await loudness.getMuted(),
    };
  }
};
