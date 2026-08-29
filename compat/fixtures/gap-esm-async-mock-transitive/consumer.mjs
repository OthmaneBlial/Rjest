import {value} from './middle.mjs';
import {second} from './second.mjs';
import {multiply} from '@rjest-fixture/math';
import {platform} from 'node:os';

export const consumed = value;
export const consumedSecond = second;
export const packageResult = multiply(6, 7);
export const platformResult = platform();
