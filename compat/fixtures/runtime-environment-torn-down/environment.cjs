const fs = require('node:fs');
const path = require('node:path');
const {TestEnvironment} = require(
  path.join(
    process.env.RJEST_COMPAT_TOOL_NODE_MODULES,
    'jest-environment-node',
  ),
);

module.exports = class Environment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.global.captureEnvironmentState = reader => {
      this.readEnvironmentTornDown = reader;
    };
  }

  async teardown() {
    fs.writeFileSync(
      path.join(__dirname, 'environment-state.json'),
      `${JSON.stringify({tornDown: this.readEnvironmentTornDown()})}\n`,
    );
    await super.teardown();
  }
};
