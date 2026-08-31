import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { hash } from '@node-rs/argon2';
import { schema, type DbHandle } from '@messa/db';
import { PinCipher } from '../src/common/pin-cipher';
import { generateTotpSecret, totpCode } from '../src/common/totp';
import { StaffPresenceService } from '../src/modules/events/staff-presence.service';

/**
 * BR-19: sem equipe conectada o backend recusa `open_session`/`resume_session`. Os e2e usam
 * `inject()` e nunca abrem socket, então precisam declarar o painel aberto explicitamente.
 * (Não há inverso: um tenant que nunca teve socket já nasce offline.)
 */
export function markStaffOnline(app: NestFastifyApplication, tenantId: string) {
  app.get(StaffPresenceService).connected(tenantId);
}

/** Cria um platform admin já com 2FA ativo (obrigatório para /platform) e devolve o access token. */
export async function createPlatformAdmin(app: NestFastifyApplication, db: DbHandle, email: string, password: string): Promise<string> {
  const passwordHash = await hash(password);
  const secret = generateTotpSecret();
  const cipher = new PinCipher(process.env.PIN_ENCRYPTION_KEY!);
  await db.withGlobalTx((tx) =>
    tx.insert(schema.users).values({ email, name: 'Platform', passwordHash, isPlatformAdmin: true, totpSecretEncrypted: cipher.encrypt(secret), totpEnabledAt: new Date() }),
  );
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password, totpCode: totpCode(secret, Date.now()) } });
  if (res.statusCode !== 200) throw new Error(`platform login failed: ${res.body}`);
  return res.json().accessToken as string;
}
