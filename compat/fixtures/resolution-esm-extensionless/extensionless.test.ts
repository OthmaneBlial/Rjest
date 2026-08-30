import {answer} from './dependency';

test('resolves an extensionless transformed ESM dependency', () => {
  expect(answer).toBe(42);
});
