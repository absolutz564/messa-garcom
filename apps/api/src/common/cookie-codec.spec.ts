import { CookieCodec, parseCookieHeader } from './cookie-codec';

describe('CookieCodec', () => {
  const codec = new CookieCodec('secret-secret-secret-secret-secret');
  it('round-trips and rejects tampering', () => {
    const v = codec.encode({ d: 'dev', t: 'ten' });
    expect(codec.decode(v)).toEqual({ d: 'dev', t: 'ten' });
    const [body, sig] = v.split('.') as [string, string];
    const tampered = Buffer.from(JSON.stringify({ d: 'other', t: 'ten' })).toString('base64url');
    expect(codec.decode(`${tampered}.${sig}`)).toBeNull();
    expect(codec.decode(`${body}.${sig.slice(1)}x`)).toBeNull();
    expect(codec.decode(undefined)).toBeNull();
    expect(new CookieCodec('another-secret-another-secret-xx').decode(v)).toBeNull();
  });
  it('parses cookie headers', () => {
    expect(parseCookieHeader('a=1; b=x%20y')).toEqual({ a: '1', b: 'x y' });
  });
});
