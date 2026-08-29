module.exports = {
  setupFiles: ['<rootDir>/setup.cjs'],
  setupFilesAfterEnv: ['<rootDir>/setup-after.cjs'],
  testEnvironment: 'jsdom',
  workerIdleMemoryLimit: '32MiB',
};
