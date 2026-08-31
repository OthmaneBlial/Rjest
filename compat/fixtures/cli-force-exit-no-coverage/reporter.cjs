const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

module.exports = class CliOverridesReporter {
  constructor(globalConfig) {
    writeFileSync(
      join(globalConfig.rootDir, 'cli-overrides.json'),
      `${JSON.stringify({
        collectCoverage: globalConfig.collectCoverage,
        detectOpenHandles: globalConfig.detectOpenHandles,
        forceExit: globalConfig.forceExit,
        maxWorkers: globalConfig.maxWorkers,
      })}\n`,
    );
  }
};
