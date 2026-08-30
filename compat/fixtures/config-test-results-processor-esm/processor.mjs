import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

export default async function processResults(results) {
  await new Promise(resolve => setTimeout(resolve, 5));
  const observation = {
    failedTests: results.numFailedTests,
    passedTests: results.numPassedTests,
    suiteCount: results.testResults.length,
    testCount: results.testResults[0].testResults.length,
  };
  writeFileSync(
    join(import.meta.dirname, 'esm-processor-observation.json'),
    `${JSON.stringify(observation, null, 2)}\n`,
  );
  return {...results, processed: {kind: 'async-esm'}};
}
