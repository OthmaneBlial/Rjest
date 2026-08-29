globalThis.__rjestEsmAutomockActualEvaluations += 1;

export const evaluation = globalThis.__rjestEsmAutomockActualEvaluations;
export function read() {
  return 'actual dependency';
}
