const path = require('node:path');

module.exports = (request, options) => {
  if (request === '@virtual') {
    return path.join(options.rootDir, 'cli-target.cjs');
  }
  return options.defaultResolver(request, options);
};
