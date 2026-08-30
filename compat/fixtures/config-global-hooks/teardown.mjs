import hookState from './hook-state.cjs';

export default async function teardown(globalConfig, projectConfig) {
  await Promise.resolve();
  hookState.append({
    envPreserved: process.env.RJEST_GLOBAL_HOOK_ENV === 'visible-to-tests',
    event: 'teardown',
    globalRootMatchesProject: globalConfig.rootDir === projectConfig.rootDir,
    projectHookIsAbsolute: projectConfig.globalTeardown.startsWith('/'),
    setupGlobalPreserved:
      globalThis.__RJEST_GLOBAL_HOOK_STATE__ === 'setup-process-only',
  });
}
