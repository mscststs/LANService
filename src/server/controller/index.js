
const requireDirectory = require('require-directory');


const hash = requireDirectory(module, __dirname, {
  include: (path)=>{
    path = path.replace(__dirname, "");
    return /.*(\/|\\)index.js/.test(path);
  }
});

module.exports = function mountController(root) {
  Object.entries(hash).map(([key, value])=>{
    root.get(`/${key}/:mod`, async (ctx)=>{
      const { mod } = ctx.params;
      await (new value.index(ctx)).call(mod);
    });
    root.post(`/${key}/:mod`, async (ctx)=>{
      const { mod } = ctx.params;
      await (new value.index(ctx)).call(mod);
    });
  });
};
