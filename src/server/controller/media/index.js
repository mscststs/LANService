const Controller = require('../../template/controller');
const robot = require("robotjs");
const loudness = require('loudness')

module.exports = class extends Controller {
  async pause(){
    robot.keyTap("audio_pause")
  }
  async stop(){
    robot.keyTap("audio_stop")
  }
  async prev(){
    robot.keyTap("audio_prev")
  }
  async next(){
    robot.keyTap("audio_next")
  }
  async volumeDown(){
    await loudness.setVolume(await loudness.getVolume() - 5);
  }
  async volumeUp(){
    await loudness.setVolume(await loudness.getVolume() + 5);
  }
  async mute(){
    await loudness.setMuted(true)
  }
  async notMute(){
    await loudness.setMuted(false)
  }

  async getVolumeInfo(){
    return{
      volume: await loudness.getVolume(),
      mute: await loudness.getMuted()
    }
  }
};
