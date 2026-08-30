const {writeFileSync} = require('node:fs');
const {join} = require('node:path');

module.exports = async results => {
  const observation = {
    success: results.success,
    suites: results.numTotalTestSuites,
    tests: results.numTotalTests,
  };
  writeFileSync(
    join(__dirname, 'empty-processor-observation.json'),
    `${JSON.stringify(observation, null, 2)}\n`,
  );
  return {...results, processed: {kind: 'empty'}};
};
