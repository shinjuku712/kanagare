import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt) as (
  pw: string,
  salt: Buffer,
  keylen: number,
  opts: crypto.ScryptOptions,
) => Promise<Buffer>;

/** scrypt with a per-user salt, stored as "scrypt$N$saltHex$hashHex". */
const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SCRYPT_KEYLEN = 64;

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Async so a login doesn't block every other request while it hashes. */
export async function verifyPassword(pw: string, stored: string | undefined | null): Promise<boolean> {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const N = Number(parts[1]);
  const salt = Buffer.from(parts[2]!, 'hex');
  const expected = Buffer.from(parts[3]!, 'hex');
  const actual = await scryptAsync(pw, salt, expected.length, { N, r: SCRYPT_r, p: SCRYPT_p });
  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Checked against when the email doesn't exist, so an unknown email takes as
 * long to reject as a wrong password and response times don't reveal which
 * accounts exist.
 */
let dummyHash: string | null = null;
export function dummyPasswordHash(): string {
  return (dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex')));
}

export function newSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
