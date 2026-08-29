test('protects the JSDOM document binding from replacement', () => {
  const originalDocument = document;
  const originalBody = document.body;

  global.document = {...document, body: {}};

  expect(document).toBe(originalDocument);
  expect(document.body).toBe(originalBody);
  expect(typeof document.createEvent).toBe('function');
});

test('keeps bare storage globals linked to redefined window storage', () => {
  const replacement = {getItem: jest.fn(() => 'replacement')};
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: replacement,
  });

  expect(sessionStorage).toBe(replacement);
  expect(sessionStorage.getItem('key')).toBe('replacement');
});
