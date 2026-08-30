const {createRequire} = require('node:module');
const {join} = require('node:path');

const requireTool = createRequire(
  join(process.env.RJEST_COMPAT_TOOL_NODE_MODULES, 'package.json'),
);
const babel = requireTool('@babel/core');
const typescript = requireTool('@babel/preset-typescript');

module.exports = {
  process(source, filename) {
    const transformed = babel.transformSync(source, {
      babelrc: false,
      configFile: false,
      filename,
      presets: [[typescript]],
      sourceFileName: filename,
      sourceMaps: true,
    });
    return {code: transformed.code, map: transformed.map};
  },
};
