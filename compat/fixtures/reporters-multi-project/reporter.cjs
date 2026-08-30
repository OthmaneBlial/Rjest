const {writeFileSync} = require('node:fs');
const {basename, join} = require('node:path');

module.exports = class MultiProjectReporter {
  constructor(globalConfig) {
    this.rootDir = globalConfig.rootDir;
    this.files = [];
  }

  onTestFileResult(test, result) {
    this.files.push({
      contextColor: test.context.config.displayName.color,
      contextName: test.context.config.displayName.name,
      path: basename(test.path),
      resultColor: result.displayName.color,
      resultName: result.displayName.name,
    });
  }

  onRunComplete(contexts, results) {
    this.files.sort((left, right) => left.path.localeCompare(right.path));
    writeFileSync(
      join(this.rootDir, 'reporter-projects.json'),
      `${JSON.stringify({
        contexts: contexts.size,
        files: this.files,
        passed: results.numPassedTests,
        suites: results.numTotalTestSuites,
      }, null, 2)}\n`,
    );
  }
};
