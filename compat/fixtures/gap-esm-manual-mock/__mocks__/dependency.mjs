import {helper} from './manual-helper.mjs';

export const kind = 'manual mock';
export const nestedHelper = helper;

export function read() {
  return 'manual implementation';
}

export function readHelper() {
  return helper();
}
