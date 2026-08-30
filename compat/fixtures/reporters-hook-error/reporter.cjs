const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

module.exports = class ThrowingReporter {
  constructor(globalConfig) {
    this.rootDir = globalConfig.rootDir;
  }

  onRunStart() {
    writeFileSync(join(this.rootDir, 'reporter-started.txt'), 'started\n');
    throw new Error('REPORTER_ON_RUN_START_FAILURE');
  }
};
