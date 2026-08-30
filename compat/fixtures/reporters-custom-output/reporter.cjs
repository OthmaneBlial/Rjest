const {basename} = require('node:path');

module.exports = class OutputReporter {
  onRunStart(results) {
    process.stdout.write(`CUSTOM START ${results.numTotalTestSuites}\n`);
  }

  onTestFileStart(test) {
    process.stdout.write(`CUSTOM FILE ${basename(test.path)}\n`);
  }

  onRunComplete(_contexts, results) {
    process.stdout.write(`CUSTOM COMPLETE ${results.numPassedTests}\n`);
  }
};
