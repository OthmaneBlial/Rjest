const {appendFileSync} = require('node:fs');
const {basename, join} = require('node:path');

module.exports = results => {
  appendFileSync(
    join(__dirname, 'watch-results.jsonl'),
    `${JSON.stringify({
      failedSuites: results.numFailedTestSuites,
      passedSuites: results.numPassedTestSuites,
      suites: results.testResults
        .map(result => basename(result.testFilePath))
        .sort(),
      totalSuites: results.numTotalTestSuites,
      totalTests: results.numTotalTests,
    })}\n`,
  );
  return results;
};
