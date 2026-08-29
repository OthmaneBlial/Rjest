globalThis.realPerformanceNowBeforeGlobalTimers = performance.now;
globalThis.realSetTimeoutBeforeGlobalTimers = setTimeout;
globalThis.realClearTimeoutBeforeGlobalTimers = clearTimeout;
