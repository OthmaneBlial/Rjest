module.exports = {
  modulePaths: [process.env.RJEST_COMPAT_TOOL_NODE_MODULES],
  setupFilesAfterEnv: ['<rootDir>/setup.cjs'],
  testEnvironment: 'node',
  transform: {},
};
