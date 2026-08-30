const path = require('node:path');
const {TestEnvironment: NodeEnvironment} = require(
  path.join(
    process.env.RJEST_COMPAT_TOOL_NODE_MODULES,
    'jest-environment-node',
  ),
);

class ConcurrentEnvironment extends NodeEnvironment {
  async handleTestEvent(event) {
    if (event.name === 'concurrent_tests_start') {
      this.global.concurrentStartNames = event.tests.map(test => test.name);
    }
    if (event.name === 'concurrent_tests_end') {
      this.global.concurrentEndNames = event.tests.map(test => test.name);
    }
  }
}

module.exports = ConcurrentEnvironment;
