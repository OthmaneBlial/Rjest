module.exports = {
  moduleNameMapper: {
    uuid: '<rootDir>/src/unanchored.js',
    '^@ordered/(.*)$': '<rootDir>/src/$1',
    '^@ordered/value$': '<rootDir>/src/should-not-win.js',
    '^@fallback$': [
      '<rootDir>/src/missing.js',
      '<rootDir>/src/fallback.js',
    ],
    '^@mocked$': '<rootDir>/src/mocked-value.js',
  },
  testEnvironment: 'node',
};
