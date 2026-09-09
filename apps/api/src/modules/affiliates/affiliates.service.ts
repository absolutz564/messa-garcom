import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { schema, type DbHandle } from '@messa/db';
import { evaluateTenantBilling } from '@messa/domain';
import type { AffiliateBlock, AffiliateReferral } from '@messa/contracts';
import { DB } from '../db/db.module';
import { MARCO, SUBJECT } from '../acquisition/acquisition.service';

/**
 * `utm_medium` que só os links gerados em /platform/aquisicao para o canal
 * "Indicação" carregam. É o que separa afiliado de indicação orgânica: quem
 * chegou por um link em blog tem `medium` nulo e não aparece aqui.
 */
const MEDIUM_AFILIADO = 'referral';

/**
 * O que o afiliado vê dos cadastros que indicou (BR-24).
 *
 * **Sem nome de restaurante, sem e-mail, sem faturamento.** Ele precisa saber
 * quantos trouxe e em que pé cada um está — não quem são. Divulgador é terceiro
 * em relação ao restaurante, e listar para ele que "Bar do Zé" é cliente entrega
 * dado comercial de quem nunca consentiu com isso. Data e situação bastam para
 * conferir a contagem.
 *
 * Crédito por **primeiro toque**: é quem apresentou o produto. Usar último toque
 * mostraria ao afiliado um cadastro que ele apresentou e depois perdeu para um
 * anúncio — e esconderia dele um que ele de fato trouxe.
 */
@Injectable()
export class AffiliatesService {
  constructor(@Inject(DB) private readonly db: DbHandle) {}

  async painel(): Promise<AffiliateBlock[]> {
    return this.db.withPlatformTx(async (tx) => {
      const atribuicoes = await tx
        .select({ subjectId: schema.origemAtribuicao.subjectId, source: schema.origemAtribuicao.firstSource })
        .from(schema.origemAtribuicao)
        .where(
          and(
            eq(schema.origemAtribuicao.subjectType, SUBJECT),
            eq(schema.origemAtribuicao.firstMedium, MEDIUM_AFILIADO),
            isNotNull(schema.origemAtribuicao.firstSource),
          ),
        );
      if (atribuicoes.length === 0) return [];

      const ids = atribuicoes.map((a) => a.subjectId);
      const [restaurantes, pagamentos] = await Promise.all([
        tx
          .select({
            id: schema.tenants.id,
            createdAt: schema.tenants.createdAt,
            billingStatus: schema.tenants.billingStatus,
            trialEndsAt: schema.tenants.trialEndsAt,
            subscriptionEndsAt: schema.tenants.subscriptionEndsAt,
          })
          .from(schema.tenants)
          // Aqui o id vai como parâmetro, e o Postgres infere `uuid` pela coluna.
          // (O cast só é necessário quando duas colunas de tipos diferentes se
          // comparam, como no join de `/platform/tenants`.)
          .where(inArray(schema.tenants.id, ids)),
        tx
          .select({ subjectId: schema.origemEvento.subjectId, occurredAt: schema.origemEvento.occurredAt })
          .from(schema.origemEvento)
          .where(
            and(
              eq(schema.origemEvento.subjectType, SUBJECT),
              eq(schema.origemEvento.name, MARCO.pagou),
              inArray(schema.origemEvento.subjectId, ids),
            ),
          ),
      ]);

      const porId = new Map(restaurantes.map((r) => [r.id, r]));
      const pagouEm = new Map(pagamentos.map((p) => [p.subjectId, p.occurredAt]));

      const porAfiliado = new Map<string, AffiliateBlock>();
      for (const a of atribuicoes) {
        const tenant = porId.get(a.subjectId);
        // Restaurante removido: a atribuição sobreviveu, mas não há o que mostrar.
        if (!tenant) continue;

        const codigo = a.source!;
        const bloco = porAfiliado.get(codigo) ?? { codigo, cadastros: 0, pagantes: 0, indicacoes: [] };

        const pagou = pagouEm.get(a.subjectId) ?? null;
        bloco.cadastros += 1;
        if (pagou) bloco.pagantes += 1;
        bloco.indicacoes.push({
          // Últimos caracteres do id: dá uma referência estável para conferir um
          // cadastro específico conosco, sem revelar qual restaurante é.
          referencia: tenant.id.slice(-6).toUpperCase(),
          cadastradaEm: tenant.createdAt.toISOString(),
          situacao: situacaoDe(tenant, Boolean(pagou)),
          pagouEm: pagou?.toISOString() ?? null,
        });
        porAfiliado.set(codigo, bloco);
      }

      for (const bloco of porAfiliado.values()) {
        bloco.indicacoes.sort((x, y) => y.cadastradaEm.localeCompare(x.cadastradaEm));
      }
      return [...porAfiliado.values()].sort((x, y) => y.cadastros - x.cadastros);
    });
  }
}

/**
 * Situação derivada de BR-20, com a mesma função que decide o acesso do
 * restaurante. Não há estado guardado: fosse guardado, esta tela e o bloqueio
 * poderiam discordar.
 */
function situacaoDe(
  tenant: { billingStatus: string; trialEndsAt: Date | null; subscriptionEndsAt: Date | null },
  pagou: boolean,
): AffiliateReferral['situacao'] {
  const { canServeCustomers } = evaluateTenantBilling({
    billingStatus: tenant.billingStatus as 'trial' | 'active',
    trialEndsAt: tenant.trialEndsAt,
    subscriptionEndsAt: tenant.subscriptionEndsAt,
  });
  if (pagou) return canServeCustomers ? 'pagante' : 'vencida';
  return canServeCustomers ? 'em_teste' : 'teste_vencido';
}
