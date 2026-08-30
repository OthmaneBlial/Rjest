const {append} = require('./hook-state.cjs');

module.exports = async (globalConfig, projectConfig) => {
  await Promise.resolve();
  globalThis.__RJEST_GLOBAL_HOOK_STATE__ = 'setup-process-only';
  process.env.RJEST_GLOBAL_HOOK_ENV = 'visible-to-tests';
  append({
    event: 'setup',
    globalRootMatchesProject: globalConfig.rootDir === projectConfig.rootDir,
    projectHookIsAbsolute: projectConfig.globalSetup.startsWith('/'),
    runInBand: globalConfig.runInBand,
  });
};
