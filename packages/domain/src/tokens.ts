import { randomInt } from 'node:crypto';
import { RULES } from './constants';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Token público da mesa (RF-21): 12 chars base62 ≈ 71 bits, CSPRNG. */
export function generatePublicToken(length: number = RULES.PUBLIC_TOKEN_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) out += BASE62[randomInt(BASE62.length)];
  return out;
}

export const PUBLIC_TOKEN_REGEX = /^[A-Za-z0-9]{8,32}$/;

/** CSPRNG para PIN. */
export const cryptoRandomInt = (maxExclusive: number): number => randomInt(maxExclusive);
