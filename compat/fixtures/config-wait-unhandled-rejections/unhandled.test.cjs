test('fails a rejection left unhandled after the extra event-loop turn', () => {
  Promise.reject(new Error('still unhandled'));
});
