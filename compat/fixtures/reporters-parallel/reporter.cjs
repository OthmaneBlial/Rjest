const {writeFileSync} = require('node:fs');
const {basename, join} = require('node:path');

module.exports = class ParallelReporter {
  constructor(globalConfig) {
    this.rootDir = globalConfig.rootDir;
    this.maxWorkers = globalConfig.maxWorkers;
    this.started = [];
    this.completed = [];
  }

  async onTestFileStart(test) {
    await Promise.resolve();
    this.started.push(basename(test.path));
  }

  async onTestFileResult(test) {
    await Promise.resolve();
    this.completed.push(basename(test.path));
  }

  onRunComplete(_contexts, results) {
    writeFileSync(
      join(this.rootDir, 'reporter-parallel.json'),
      `${JSON.stringify({
        completed: this.completed.sort(),
        maxWorkers: this.maxWorkers,
        passed: results.numPassedTests,
        started: this.started.sort(),
      }, null, 2)}\n`,
    );
  }
};
