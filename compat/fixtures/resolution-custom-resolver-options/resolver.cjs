const path = require('node:path');

function withMutableOptions(request, options) {
  if (request === '@rjest-fixture/math') {
    return options.defaultResolver(request, {
      ...options,
      mainFields: ['module', 'main'],
    });
  }
  if (request === 'resolver-alias') {
    return options.defaultResolver(request, {
      ...options,
      alias: {
        'resolver-alias': [path.join(__dirname, 'targets/aliased.cjs')],
      },
    });
  }
  if (request === './targets/extension.js') {
    return options.defaultResolver(request, {
      ...options,
      extensionAlias: {'.js': ['.cjs']},
    });
  }
  return undefined;
}

module.exports = {
  async async(request, options) {
    await Promise.resolve();
    if (request === 'hook-target') {
      return path.join(__dirname, 'targets/async-target.mjs');
    }
    return (
      withMutableOptions(request, options) ??
      options.defaultAsyncResolver(request, options)
    );
  },
  sync(request, options) {
    if (request === 'hook-target') {
      return path.join(__dirname, 'targets/sync-target.cjs');
    }
    return (
      withMutableOptions(request, options) ??
      options.defaultResolver(request, options)
    );
  },
};
