/**
 * Controller ，所有控制器的基类
 */
const { v4: uuidv4 } = require('uuid');

class Controller {
  constructor(ctx) {
    this.ctx = ctx;
    this.ctx.env = 'prd';
    // 初始化 requestId
    this.ctx.uuid = this.ctx.uuid || this.ctx.headers.RequestId || uuidv4();
    this.ctx.set({
      RequestId: this.ctx.uuid
    });
  }

  get templateReply() {
    return {
      code: 0,
      msg: 'OK',
      data: null
    };
  }

  setBody(response) {
    this.ctx.body = response;
  }

  ok(data) {
    if (this.ctx.body) {
      // 函数内使用 ctx.body 直接输出了，无需包装
      return;
    }
    switch (typeof data) {
      case 'number':
      case 'string':
      case 'object':
        this.setBody({
          ...this.templateReply,
          data
        });
        break;
      default:
        this.setBody({
          ...this.templateReply,
          data
        });
        break;
    }
  }

  setErr(msg) {
    this.errorMsg = msg;
  }

  err(errorCode, errorMsg, err) {
    if (errorCode) {
      this.setBody({
        requestId: this.ctx.uuid,
        code: errorCode,
        msg: errorMsg || '',
        ...{ err }
      });
    } else {
      this.setBody({
        requestId: this.ctx.uuid,
        code: -1,
        msg: this.errorMsg,
        ...{ err }
      });
    }
    this.ctx.status = 400;
  }

  /**
   * @description 断言,非 true 时抛出 err
   * @param {*} val
   * @param {string} errMsg 断言失败的报错信息
   */
  assert(val, errMsg) {
    if (typeof val === 'function') {
      val = val();
    }
    if (!val) {
      throw new Error(errMsg || 'ASSERT - 参数不合法');
    }
  }

  isSafe(modName) {
    // 需要屏蔽掉的方法
    const privateFuncList = [
      'isSafe',
      'err',
      'setErr',
      'ok',
      'toString',
      'call',
      'super',
      'templateReply',
      'errorMsg',
      'setBody',
      'assert',
      ...Object.getOwnPropertyNames(Reflect),
      ...Object.getOwnPropertyNames(Object),
      ...Object.getOwnPropertyNames(Object.prototype),
      ...Object.getOwnPropertyNames(Function.prototype)
    ];
    return !~privateFuncList.indexOf(modName);
  }

  // 自文档函数
  doc() {
    this.ctx.body = `<ul style="color:#1e52b8">${
      Object.entries(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(this)))
      .filter(([k,v]) => v.writable).map(([k,v])=>k) // 过滤 非 Writable 属性 (移除 get 属性)
      .filter(v => this.isSafe(v)) // 过滤 内部方法
      .map(v => {
        const val = [...this[v].toString().split('\n')[0].matchAll(/\((.*?)\)/g)];
        if (val.length) {
          const param = val[0][1];
          return `<li><b><a href="./${v}">${v}</a></b>: ${param || '-'}</li>`;
        }
      })
      .filter(v => v)
      .sort((a, b)=>{
        return a.length - b.length;
      })
      .join('')}</ul>`;
  }

  async call(modName) {
    if (this[modName] && typeof this[modName] === 'function' && this.isSafe(modName)) {
      // can Find Current Function
      try {
        // 生产环境禁止使用私有函数
        if (this.ctx.env !== 'dev' && modName.startsWith('_')) {
          throw new Error('生产环境禁用');
        }
        const query = this.ctx.query;
        const body = this.ctx.request.body;
        const params = { ...query, ...body };
        const res = await this[modName](params, body, query); // Call Target Function

        // create response
        this.ok(res);
      } catch (e) {
        if (e instanceof Error) {
          console.error(e.stack.replace(/\n/g, "\\n"));
        } else {
          console.error(e);
        }

        if (this.errorMsg) {
          this.err(null, null, e);
        } else {
          // 使用当前错误栈
          this.err(-2, e.message, e);
        }
      }
    } else {
      this.err(-1, 'fail, module not found');
    }
  }
}

module.exports = Controller;
