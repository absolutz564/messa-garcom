import { base32Decode, base32Encode, generateTotpSecret, otpauthUrl, totpCode, verifyTotp } from './totp';

describe('TOTP (RFC 6238 vectors, SHA1, 6 digits)', () => {
  // Segredo do RFC: "12345678901234567890"
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it('base32 round-trip', () => {
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
  });
  it('matches the RFC test vectors (last 6 digits)', () => {
    expect(totpCode(secret, 59_000)).toBe('287082');
    expect(totpCode(secret, 1_111_111_109_000)).toBe('081804');
    expect(totpCode(secret, 1_234_567_890_000)).toBe('005924');
  });
  it('verifies with ±1 window and rejects garbage', () => {
    expect(verifyTotp(secret, '287082', 59_000)).toBe(true);
    expect(verifyTotp(secret, '287082', 59_000 + 30_000)).toBe(true);
    expect(verifyTotp(secret, '287082', 59_000 + 61_000)).toBe(false);
    expect(verifyTotp(secret, '12345', 59_000)).toBe(false);
  });
  it('generates 32-char secrets and otpauth urls', () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUrl('Messa', 'a@b.c', s)).toBe(`otpauth://totp/Messa%3Aa%40b.c?secret=${s}&issuer=Messa&algorithm=SHA1&digits=6&period=30`);
  });
});
