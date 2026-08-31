const {basename} = require('node:path');

module.exports = class CliReporter {
  onRunStart(results) {
    process.stdout.write(`CLI REPORTER START ${results.numTotalTestSuites}\n`);
  }

  onTestFileStart(test) {
    process.stdout.write(`CLI REPORTER FILE ${basename(test.path)}\n`);
  }

  onRunComplete(_contexts, results) {
    process.stdout.write(`CLI REPORTER COMPLETE ${results.numPassedTests}\n`);
  }
};
