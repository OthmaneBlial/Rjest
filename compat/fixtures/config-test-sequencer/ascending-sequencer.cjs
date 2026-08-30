const {writeFileSync} = require('node:fs');

module.exports = class AscendingSequencer {
  constructor({globalConfig}) {
    if (globalConfig.seed !== 17) {
      throw new Error(`expected seed 17, received ${globalConfig.seed}`);
    }
  }

  sort(tests) {
    return [...tests].sort((left, right) => left.path.localeCompare(right.path));
  }

  cacheResults(tests, results) {
    writeFileSync('override-cache.marker', `${tests.length}:${results.numPassedTests}`);
  }
};
