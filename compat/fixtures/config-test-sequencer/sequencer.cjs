const {writeFileSync} = require('node:fs');
const Sequencer = require(
  require.resolve('@jest/test-sequencer', {
    paths: [process.env.RJEST_COMPAT_TOOL_NODE_MODULES],
  }),
).default;

module.exports = class SeedAwareSequencer extends Sequencer {
  constructor({contexts, globalConfig}) {
    super({contexts, globalConfig});
    if (!Array.isArray(contexts) || contexts.length !== 1) {
      throw new Error('expected one Jest test context');
    }
    if (globalConfig.seed !== 17) {
      throw new Error(`expected seed 17, received ${globalConfig.seed}`);
    }
  }

  async shard(tests, {shardIndex, shardCount}) {
    await Promise.resolve();
    if (shardIndex !== 2 || shardCount !== 3) {
      throw new Error(`unexpected shard ${shardIndex}/${shardCount}`);
    }
    return [...tests].sort((left, right) => left.path.localeCompare(right.path)).slice(1, 2);
  }

  async sort(tests) {
    await Promise.resolve();
    return [...tests].sort((left, right) => right.path.localeCompare(left.path));
  }

  cacheResults(tests, results) {
    super.cacheResults(tests, results);
    writeFileSync('cache.marker', `${tests.length}:${results.numFailedTests}`);
  }
};
