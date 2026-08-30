const {appendFileSync} = require('node:fs');
const {basename, join} = require('node:path');

module.exports = results => {
  const suites = results.testResults
    .map(result => basename(result.testFilePath))
    .sort();
  appendFileSync(
    join(__dirname, 'watch-results.jsonl'),
    `${JSON.stringify({
      failedSuites: results.numFailedTestSuites,
      passedSuites: results.numPassedTestSuites,
      suites,
      totalSuites: results.numTotalTestSuites,
      totalTests: results.numTotalTests,
    })}\n`,
  );
  return results;
};
