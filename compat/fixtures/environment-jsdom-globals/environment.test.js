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

test('resolves global aliases through their JSDOM window getters', () => {
  const originalWindow = window;
  const selfGetter = jest.spyOn(originalWindow, 'self', 'get');
  const replacement = {marker: 'replacement-self'};

  try {
    selfGetter.mockReturnValue(replacement);
    expect(self).toBe(replacement);
  } finally {
    selfGetter.mockRestore();
  }

  expect(self).toBe(originalWindow);
});

test('keeps bare IndexedDB globals linked to window assignments', () => {
  const replacement = {bound: jest.fn()};
  window.IDBKeyRange = replacement;

  expect(IDBKeyRange).toBe(replacement);
});

test('does not leak Node-only encoding globals into JSDOM', () => {
  expect(typeof TextEncoder).toBe('undefined');
  expect(typeof TextDecoder).toBe('undefined');
});

test('keeps mutable browser constructors linked to window assignments', () => {
  const originals = {
    XMLHttpRequest: window.XMLHttpRequest,
    FileReader: window.FileReader,
    ReadableStream: window.ReadableStream,
  };
  const replacements = {
    XMLHttpRequest: jest.fn(),
    FileReader: jest.fn(),
    ReadableStream: jest.fn(),
  };

  try {
    Object.assign(window, replacements);
    expect(XMLHttpRequest).toBe(replacements.XMLHttpRequest);
    expect(FileReader).toBe(replacements.FileReader);
    expect(ReadableStream).toBe(replacements.ReadableStream);
  } finally {
    Object.assign(window, originals);
  }
});

test('keeps JSDOM built-ins separate from Node constructor results', () => {
  const {TextEncoder: NodeTextEncoder} = require('node:util');
  const nodeBuffer = new NodeTextEncoder().encode('data').buffer;

  expect(nodeBuffer).not.toBeInstanceOf(ArrayBuffer);
});
