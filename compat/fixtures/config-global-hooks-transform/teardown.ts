const {append} = require('./hook-state.cjs');

module.exports = async function teardown(
  _globalConfig: object,
  projectConfig: {globalTeardown: string},
): Promise<void> {
  await Promise.resolve();
  append({
    envPreserved: process.env.RJEST_TRANSFORMED_GLOBAL_HOOK === 'ready',
    event: 'transformed-teardown',
    pathIsAbsolute: projectConfig.globalTeardown.startsWith('/'),
  });
};
