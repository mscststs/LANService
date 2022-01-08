const Controller = require('../../template/controller');

module.exports = class extends Controller {

  async info(params, body, query) {
    const request = this.ctx.request;
    return {
      request,
      query,
      body
    };
  }

  async _env() {
    return {
      "ctx.env": this.ctx.env,
      "process.env": process.env,
    };
  }
};
