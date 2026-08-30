const {append} = require('./hook-state.cjs');

module.exports = async (_globalConfig, projectConfig) => {
  await Promise.resolve();
  append({
    event: 'beta-teardown',
    project: projectConfig.displayName.name,
  });
};
