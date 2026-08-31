const project = (name) => ({
  displayName: name,
  rootDir: `<rootDir>/${name}`,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.cjs'],
  testTimeout: 10,
  transform: {},
});

module.exports = {
  projects: [project('alpha'), project('beta')],
};
