globalThis.modernTimerSetupState = {
  clock: Date.now(),
  performancePreserved:
    performance.now === globalThis.realPerformanceNowBeforeGlobalTimers,
  clearTimeoutPreserved:
    clearTimeout === globalThis.realClearTimeoutBeforeGlobalTimers,
  setTimeoutReplaced: setTimeout !== globalThis.realSetTimeoutBeforeGlobalTimers,
};
