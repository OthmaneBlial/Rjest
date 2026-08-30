const {existsSync, writeFileSync} = require('node:fs');
const {basename, join} = require('node:path');

module.exports = async results => {
  await Promise.resolve();
  const observation = {
    counts: {
      failedSuites: results.numFailedTestSuites,
      failedTests: results.numFailedTests,
      passedSuites: results.numPassedTestSuites,
      passedTests: results.numPassedTests,
      pendingTests: results.numPendingTests,
      todoTests: results.numTodoTests,
      totalSuites: results.numTotalTestSuites,
      totalTests: results.numTotalTests,
    },
    environment: {
      setup: process.env.RJEST_PROCESSOR_SETUP,
      teardown: process.env.RJEST_PROCESSOR_TEARDOWN,
    },
    openHandles: Array.isArray(results.openHandles),
    suite: {
      file: basename(results.testResults[0].testFilePath),
      statuses: results.testResults[0].testResults.map(test => test.status),
    },
    teardownComplete: existsSync(join(__dirname, 'teardown-complete.txt')),
    wasInterrupted: results.wasInterrupted,
  };
  writeFileSync(
    join(__dirname, 'processor-observation.json'),
    `${JSON.stringify(observation, null, 2)}\n`,
  );
  results.processed = {kind: 'async-commonjs', teardownComplete: true};
  return results;
};
