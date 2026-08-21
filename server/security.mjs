import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export async function hashPassword(password, minimumLength = 10) {
  const value = String(password || '');
  if (value.length < minimumLength) throw new Error(`密码至少需要 ${minimumLength} 个字符`);
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(value, salt, 64);
  return { salt, hash: hash.toString('hex') };
}

export async function verifyPassword(password, salt, expectedHash) {
  const candidate = await scrypt(String(password || ''), salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function generateReportCode() {
  return `RP-${randomBytes(9).toString('base64url')}`;
}
