const {writeFileSync} = require('node:fs');
const path = require('node:path');
const {TestEnvironment: NodeEnvironment} = require(
  path.join(
    process.env.RJEST_COMPAT_TOOL_NODE_MODULES,
    'jest-environment-node',
  ),
);

const trackedEvents = new Set([
  'setup',
  'run_start',
  'test_start',
  'test_started',
  'hook_start',
  'hook_success',
  'test_fn_start',
  'test_fn_success',
  'test_done',
  'run_finish',
  'teardown',
]);

class FixtureEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    this.events = [];
    this.testPath = context.testPath;
    const options = config.projectConfig.testEnvironmentOptions;
    this.global.environmentConstructor = {
      consoleAvailable: typeof context.console.log === 'function',
      fromConfig: options.fromConfig,
      fromDocblock: options.fromDocblock,
      overridden: options.overridden,
      pragma: context.docblockPragmas['fixture-value'],
      rootDirMatches:
        config.projectConfig.rootDir === path.dirname(context.testPath),
      testFile: path.basename(context.testPath),
    };
  }

  async setup() {
    await super.setup();
    await Promise.resolve();
    this.global.environmentSetup = 'ready';
  }

  async handleTestEvent(event) {
    if (!trackedEvents.has(event.name)) return;
    await Promise.resolve();
    const suffix = event.hook
      ? `:${event.hook.type}`
      : event.test
        ? `:${event.test.name}`
        : '';
    this.events.push(`${event.name}${suffix}`);
    if (event.name === 'hook_start') {
      this.global.environmentCurrentHook = event.hook.type;
    }
    if (event.name === 'test_fn_start') {
      this.global.environmentCurrentTest = event.test.name;
    }
  }

  async teardown() {
    writeFileSync(
      path.join(path.dirname(this.testPath), 'environment-events.json'),
      JSON.stringify({events: this.events, setup: this.global.environmentSetup}),
    );
    await super.teardown();
  }
}

module.exports = FixtureEnvironment;
