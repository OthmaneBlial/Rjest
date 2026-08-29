const events = [];

beforeAll(() => events.push('root beforeAll'));
afterAll(() => {
  expect(events).toEqual([
    'root beforeAll',
    'outer beforeEach',
    'inner beforeEach',
    'promise test',
    'inner afterEach',
    'outer afterEach',
    'outer beforeEach',
    'inner beforeEach',
    'callback test',
    'inner afterEach',
    'outer afterEach',
  ]);
});

describe('async hooks', () => {
  beforeEach(() => events.push('outer beforeEach'));
  afterEach(() => events.push('outer afterEach'));

  describe('nested', () => {
    beforeEach(async () => {
      await Promise.resolve();
      events.push('inner beforeEach');
    });
    afterEach(() => events.push('inner afterEach'));

    test('awaits promises', async () => {
      await Promise.resolve();
      events.push('promise test');
      await expect(Promise.resolve('ready')).resolves.toBe('ready');
    });

    test('supports done callbacks', done => {
      setTimeout(() => {
        events.push('callback test');
        done();
      }, 1);
    });
  });
});
