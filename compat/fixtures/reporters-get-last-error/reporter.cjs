const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

module.exports = class PolicyReporter {
  constructor(globalConfig) {
    this.rootDir = globalConfig.rootDir;
    this.completed = false;
    this.lastErrorCalls = 0;
  }

  onRunComplete(_contexts, results) {
    this.completed = results.numPassedTests === 1 && results.numFailedTests === 0;
  }

  getLastError() {
    this.lastErrorCalls += 1;
    writeFileSync(
      join(this.rootDir, 'reporter-error.json'),
      `${JSON.stringify({
        completed: this.completed,
        lastErrorCalls: this.lastErrorCalls,
      })}\n`,
    );
    return new Error('REPORTER_POLICY_FAILURE');
  }
};
