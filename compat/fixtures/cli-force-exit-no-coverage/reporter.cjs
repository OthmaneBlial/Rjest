const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

module.exports = class CliOverridesReporter {
  constructor(globalConfig) {
    writeFileSync(
      join(globalConfig.rootDir, 'cli-overrides.json'),
      `${JSON.stringify({
        collectCoverage: globalConfig.collectCoverage,
        forceExit: globalConfig.forceExit,
      })}\n`,
    );
  }
};
