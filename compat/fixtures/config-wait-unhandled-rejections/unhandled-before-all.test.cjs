beforeAll(() => {
  Promise.reject(new Error('unhandled from beforeAll'));
});

test('first descendant receives the beforeAll rejection', () => {});
test('second descendant receives the beforeAll rejection', () => {});
