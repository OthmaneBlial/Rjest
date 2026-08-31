test('shares Jest browser global identity', () => {
  expect(window).toBe(globalThis);
  expect(self).toBe(globalThis);
  expect(global).toBe(globalThis);
});

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
  const originals = {
    IDBKeyRange: window.IDBKeyRange,
    IDBRequest: window.IDBRequest,
    IDBTransaction: window.IDBTransaction,
  };
  const replacements = {
    IDBKeyRange: {bound: jest.fn()},
    IDBRequest: jest.fn(),
    IDBTransaction: jest.fn(),
  };

  try {
    Object.assign(window, replacements);
    expect(IDBKeyRange).toBe(replacements.IDBKeyRange);
    expect(IDBRequest).toBe(replacements.IDBRequest);
    expect(IDBTransaction).toBe(replacements.IDBTransaction);
  } finally {
    Object.assign(window, originals);
  }
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

test('tears down JSDOM before pending zero-delay callbacks escape', () => {
  setTimeout(() => {
    throw new Error('callback should be cancelled by environment teardown');
  }, 0);
});

test('continues without draining the JSDOM timer queue between tests', () => {
  const deadline = Date.now() + 20;
  while (Date.now() < deadline) {
    // Keep this synchronous: Jest tears the environment down before timers run.
  }
  expect(document.readyState).toBe('complete');
});
