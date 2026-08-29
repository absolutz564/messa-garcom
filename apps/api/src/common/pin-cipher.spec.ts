import { PinCipher } from './pin-cipher';

const key = Buffer.alloc(32, 7).toString('base64');

describe('PinCipher (PDR-005)', () => {
  const c = new PinCipher(key);
  it('round-trips and produces distinct ciphertexts', () => {
    const a = c.encrypt('0042');
    const b = c.encrypt('0042');
    expect(a).not.toBe(b);
    expect(c.decrypt(a)).toBe('0042');
    expect(c.matches(b, '0042')).toBe(true);
    expect(c.matches(b, '0043')).toBe(false);
  });
  it('rejects wrong key length', () => {
    expect(() => new PinCipher('c2hvcnQ=')).toThrow();
  });
});
