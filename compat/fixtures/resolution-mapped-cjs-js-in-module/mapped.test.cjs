test('executes a mapped .js file in the CommonJS Jest runtime', () => {
  expect(require('legacy-cjs')).toBe('CommonJS despite package type');
});
