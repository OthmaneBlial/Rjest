const {append} = require('./hook-state.cjs');

module.exports = async function setup(
  _globalConfig: object,
  projectConfig: {globalSetup: string},
): Promise<void> {
  await Promise.resolve();
  process.env.RJEST_TRANSFORMED_GLOBAL_HOOK = 'ready';
  append({
    event: 'transformed-setup',
    pathIsAbsolute: projectConfig.globalSetup.startsWith('/'),
  });
};
