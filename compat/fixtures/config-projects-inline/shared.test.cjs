const flavor = require('project-flavor');

test(`executes the ${flavor} project`, () => {
  expect(flavor).toMatch(/^(alpha|beta)$/);
});
