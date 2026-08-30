import {writeFileSync} from 'node:fs';

export default class ESMSequencer {
  constructor({contexts, globalConfig}) {
    if (contexts.length !== 1 || globalConfig.seed !== 23) {
      throw new Error('ESM sequencer received incorrect constructor options');
    }
  }

  async sort(tests) {
    await Promise.resolve();
    return [...tests].sort((left, right) => right.path.localeCompare(left.path));
  }

  cacheResults(tests, results) {
    writeFileSync('esm-cache.marker', `${tests.length}:${results.numPassedTests}`);
  }
}
