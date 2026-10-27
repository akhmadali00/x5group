import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, totpAt, verifyTotp, base32Encode, base32Decode } from '../src/lib/crypto.ts';

test('parol xeshi to\'g\'ri/noto\'g\'ri', async () => {
  const h = await hashPassword('sirli-parol-1');
  assert.ok(h.startsWith('scrypt$'));
  assert.equal(await verifyPassword('sirli-parol-1', h), true);
  assert.equal(await verifyPassword('boshqa', h), false);
  assert.equal(await verifyPassword('x', null), false);
});

test('TOTP RFC 6238 test vektori (SHA-1)', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totpAt(secret, 59_000), '287082');
  assert.equal(totpAt(secret, 1111111109_000), '081804');
  assert.equal(totpAt(secret, 1234567890_000), '005924');
  assert.equal(verifyTotp(secret, '287082', 59_000), true);
  assert.equal(verifyTotp(secret, '287082', 59_000 + 30_000), true);  // 1 oyna keyin
  assert.equal(verifyTotp(secret, '287082', 59_000 + 120_000), false);
  assert.equal(verifyTotp(secret, 'abcdef', 59_000), false);
});

test('base32 aylanishi', () => {
  const b = Buffer.from('salom dunyo');
  assert.deepEqual(base32Decode(base32Encode(b)), b);
});
