const path = require('node:path');

module.exports = {
  async async(request, options) {
    await Promise.resolve();
    if (request === 'async-only-target') {
      return path.join(__dirname, 'target.mjs');
    }
    return options.defaultAsyncResolver(request, options);
  },
};
