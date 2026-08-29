import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * PDR-005: o PIN precisa ser exibido a participantes, logo é cifrado (AES-256-GCM), não hasheado.
 * Formato: base64(iv) . base64(tag) . base64(ciphertext)
 */
export class PinCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) throw new Error('PIN_ENCRYPTION_KEY deve ter 32 bytes em base64');
    this.key = key;
  }

  encrypt(pin: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
  }

  decrypt(blob: string): string {
    const [iv, tag, ct] = blob.split('.').map((p) => Buffer.from(p, 'base64'));
    if (!iv || !tag || !ct) throw new Error('PIN cifrado inválido');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }

  matches(blob: string, candidate: string): boolean {
    const real = Buffer.from(this.decrypt(blob));
    const given = Buffer.from(candidate);
    return real.length === given.length && timingSafeEqual(real, given);
  }
}
