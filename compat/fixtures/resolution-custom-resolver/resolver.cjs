const path = require('node:path');

module.exports = (request, options) => {
  if (
    typeof options.defaultResolver !== 'function' ||
    typeof options.defaultAsyncResolver !== 'function'
  ) {
    throw new TypeError('custom resolver defaults must be functions');
  }
  if (request === 'condition-target') {
    return path.join(
      __dirname,
      options.conditions?.includes('import')
        ? 'targets/import-target.mjs'
        : 'targets/require-target.cjs',
    );
  }
  if (request === 'virtual-target') {
    return path.join(__dirname, 'targets/virtual-target.cjs');
  }
  return options.defaultResolver(request, options);
};
