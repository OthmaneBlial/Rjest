export default function subtract(left, right) {
  return left - right;
}

export function add(left, right) {
  return left + right;
}

export class Calculator {
  multiply(left, right) {
    return left * right;
  }
}

export const list = ['actual item'];
export const label = 'actual label';

export const nested = {
  label: 'actual',
  method() {
    return 'actual method';
  },
};
