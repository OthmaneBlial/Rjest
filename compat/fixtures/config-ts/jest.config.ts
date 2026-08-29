type Config = {
  testEnvironment: 'node';
  testMatch: string[];
  testTimeout: number;
};

const config: Config = {
  testEnvironment: 'node',
  testMatch: ['**/*.check.js'],
  testTimeout: 1000,
};

export default config;
