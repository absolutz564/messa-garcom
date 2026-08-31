import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config';

/**
 * Cobrança Pix com confirmação automática (BR-20/ADR-006).
 *
 * Contrato enxuto de propósito: criar uma cobrança e perguntar se ela foi paga.
 * Sem webhook — o job de fundo (`BillingJobs`) e a tela de assinatura consultam
 * `isPaid` periodicamente, o mesmo padrão já validado em produção pelo Terap-IA Kids.
 */
export interface PixCharge {
  /** Id da cobrança no provedor, usado para consultar depois. */
  providerChargeId: string;
  /** Código "copia e cola" do Pix. */
  qrCode: string;
  /** Imagem do QR em base64, quando o provedor a fornece. */
  qrCodeBase64: string | null;
  expiresAt: Date;
}

export interface PixProvider {
  name: string;
  createCharge(input: { amountCents: number; description: string; reference: string; payerEmail: string }): Promise<PixCharge>;
  /** `true` só quando o dinheiro entrou de fato. */
  isPaid(providerChargeId: string): Promise<boolean>;
}

const MERCADO_PAGO_BASE = 'https://api.mercadopago.com';

interface MercadoPagoPayment {
  id?: number;
  status?: string;
  message?: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
}

class MercadoPagoProvider implements PixProvider {
  readonly name = 'mercadopago';

  constructor(
    private readonly token: string,
    private readonly ttlMinutes: number,
  ) {}

  async createCharge(input: { amountCents: number; description: string; reference: string; payerEmail: string }): Promise<PixCharge> {
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000);
    const res = await fetch(`${MERCADO_PAGO_BASE}/v1/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        // Repetir a mesma referência não cria cobrança duplicada — protege contra reenvio.
        'X-Idempotency-Key': input.reference,
      },
      body: JSON.stringify({
        transaction_amount: input.amountCents / 100,
        description: input.description,
        payment_method_id: 'pix',
        external_reference: input.reference,
        date_of_expiration: expiresAt.toISOString().replace('Z', '+00:00'),
        payer: { email: input.payerEmail },
      }),
    });
    const body = (await res.json().catch(() => null)) as MercadoPagoPayment | null;
    if (!res.ok || !body?.id) throw new Error(`Mercado Pago recusou a cobrança (HTTP ${res.status}): ${body?.message ?? 'sem detalhe'}`);
    const tx = body.point_of_interaction?.transaction_data;
    if (!tx?.qr_code) throw new Error('Mercado Pago não devolveu o código Pix.');
    return { providerChargeId: String(body.id), qrCode: tx.qr_code, qrCodeBase64: tx.qr_code_base64 ?? null, expiresAt };
  }

  async isPaid(providerChargeId: string): Promise<boolean> {
    const res = await fetch(`${MERCADO_PAGO_BASE}/v1/payments/${providerChargeId}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as MercadoPagoPayment | null;
    // Só "approved" conta — "in_process"/"pending" é dinheiro que ainda não chegou.
    return body?.status === 'approved';
  }
}

/** Fábrica do provedor configurado — `null` quando não há token (cobrança automática indisponível, mas nada quebra). */
@Injectable()
export class PixProviderFactory {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get(ttlMinutes: number): PixProvider | null {
    const token = this.config.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    if (!token) return null;
    return new MercadoPagoProvider(token, ttlMinutes);
  }
}
