test('protects the JSDOM document binding from replacement', () => {
  const originalDocument = document;
  const originalBody = document.body;

  global.document = {...document, body: {}};

  expect(document).toBe(originalDocument);
  expect(document.body).toBe(originalBody);
  expect(typeof document.createEvent).toBe('function');
});
