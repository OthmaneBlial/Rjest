export default async () => ({
  maxWorkers: '50%',
  testEnvironment: 'node',
  testMatch: ['**/*.check.js'],
  testTimeout: 1000,
});
