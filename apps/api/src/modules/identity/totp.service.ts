import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { schema, type DbHandle } from '@messa/db';
import type { TotpSetupResponse } from '@messa/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config';
import { DB } from '../db/db.module';
import { PinCipher } from '../../common/pin-cipher';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../../common/totp';

/**
 * 2FA (TOTP) — obrigatório para platform admin (05-security/threat-model.md).
 * O segredo fica cifrado (AES-GCM, mesma chave do PIN) e só é habilitado após um código válido.
 */
@Injectable()
export class TotpService {
  private readonly cipher: PinCipher;

  constructor(
    @Inject(DB) private readonly db: DbHandle,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.cipher = new PinCipher(config.PIN_ENCRYPTION_KEY);
  }

  /** Gera (ou regenera, se ainda não habilitado) o segredo e devolve QR para o app autenticador. */
  async setup(userId: string): Promise<TotpSetupResponse> {
    return this.db.withGlobalTx(async (tx) => {
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
      if (!user) throw new NotFoundException({ code: 'not_found' });
      if (user.totpEnabledAt) throw new BadRequestException({ code: 'totp_already_enabled', message: '2FA já está ativo' });
      const secret = generateTotpSecret();
      await tx.update(schema.users).set({ totpSecretEncrypted: this.cipher.encrypt(secret) }).where(eq(schema.users.id, userId));
      const url = otpauthUrl('Messa', user.email, secret);
      const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1 });
      return { secret, otpauthUrl: url, qrSvg };
    });
  }

  /** Confirma o código do app e ativa o 2FA. */
  async enable(userId: string, code: string): Promise<void> {
    await this.db.withGlobalTx(async (tx) => {
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
      if (!user?.totpSecretEncrypted) throw new BadRequestException({ code: 'totp_not_setup', message: 'Faça a configuração primeiro' });
      if (user.totpEnabledAt) throw new BadRequestException({ code: 'totp_already_enabled', message: '2FA já está ativo' });
      if (!verifyTotp(this.cipher.decrypt(user.totpSecretEncrypted), code)) {
        throw new BadRequestException({ code: 'totp_invalid', message: 'Código inválido. Confira o relógio do celular e tente de novo.' });
      }
      await tx.update(schema.users).set({ totpEnabledAt: new Date() }).where(eq(schema.users.id, userId));
    });
  }

  /** Usado no login. `null` = usuário sem 2FA. */
  verify(user: { totpSecretEncrypted: string | null; totpEnabledAt: Date | null }, code: string | undefined): boolean | null {
    if (!user.totpEnabledAt || !user.totpSecretEncrypted) return null;
    if (!code) return false;
    return verifyTotp(this.cipher.decrypt(user.totpSecretEncrypted), code);
  }
}

