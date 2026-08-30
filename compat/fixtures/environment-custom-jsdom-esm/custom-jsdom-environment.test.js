test('runs in a top-level-await ESM JSDOM environment', async () => {
  expect(environmentModuleKind).toBe('top-level-await-esm');
  expect(environmentJsdomSetup).toMatch(/loading|interactive|complete/);
  expect(window).toBe(globalThis);
  expect(document.createElement('main').tagName).toBe('MAIN');
  expect(location.href).toBe('https://custom-environment.example/path');
  expect(Number.isFinite(performance.now())).toBe(true);
  expect(Number.isFinite(window.performance.now())).toBe(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => queueMicrotask(resolve));
});

test('forwards Window event-target methods through the custom realm', () => {
  const listener = jest.fn();
  window.addEventListener('rjest-custom-event', listener);

  expect(window.dispatchEvent(new Event('rjest-custom-event'))).toBe(true);
  expect(listener).toHaveBeenCalledTimes(1);

  window.removeEventListener('rjest-custom-event', listener);
  window.dispatchEvent(new Event('rjest-custom-event'));
  expect(listener).toHaveBeenCalledTimes(1);
});
