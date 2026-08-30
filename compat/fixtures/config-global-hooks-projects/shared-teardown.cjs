const {append} = require('./hook-state.cjs');

module.exports = async (_globalConfig, projectConfig) => {
  await Promise.resolve();
  append({
    event: 'shared-teardown',
    project: projectConfig.displayName.name,
  });
};
