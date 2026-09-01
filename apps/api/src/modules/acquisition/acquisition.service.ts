import { Inject, Injectable, Logger } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import type { DbHandle } from '@messa/db';
import { lerOrigem } from '@messa/origem';
import { gravarAtribuicao, lancarGasto, listarLinks, registrarEvento, registrarLink, relatorio } from '@messa/origem/dist/adapters/sql';
import type { Attribution, CampaignLink, Channel, LinhaRelatorio, OpcoesRelatorio } from '@messa/origem';
import { DB } from '../db/db.module';

/** O sujeito atribuído no Messa é o restaurante, não a pessoa. */
export const SUBJECT = 'tenant';

/** Marcos do funil (BR-23). Nomes fixos: o relatório os usa para contar ativados e pagantes. */
export const MARCO = { cadastrou: 'cadastrou', ativou: 'ativou', pagou: 'pagou' } as const;

/**
 * Nomes e convenção deste projeto. A biblioteca nasceu em camelCase (Prisma);
 * aqui tudo é snake_case, e o `id` é uuid v7 como no resto do schema.
 */
const OPCOES = {
  colunas: 'snake' as const,
  tabelas: { atribuicao: 'origem_atribuicao', evento: 'origem_evento', gasto: 'origem_gasto', link: 'origem_link' },
  novoId: () => uuidv7(),
};

/**
 * Aquisição (RF-07/BR-23): de onde veio cada restaurante e quanto custou trazê-lo.
 *
 * Toda escrita aqui é **best-effort e nunca propaga erro**. Atribuição é dado de
 * marketing: derrubar um cadastro, um pedido ou a confirmação de um pagamento
 * porque a gravação da origem falhou seria trocar receita por relatório.
 */
@Injectable()
export class AcquisitionService {
  private readonly log = new Logger(AcquisitionService.name);

  constructor(@Inject(DB) private readonly db: DbHandle) {}

  /** Lê os cookies de origem que o navegador guardou desde a primeira visita. */
  origemDoCabecalho(cookieHeader: string | undefined): Attribution {
    return lerOrigem(cookieHeader);
  }

  /** Grava a origem do restaurante recém-criado e marca o primeiro marco. */
  async registrarCadastro(tenantId: string, origem: Attribution): Promise<void> {
    await this.silencioso('registrar cadastro', async () => {
      await gravarAtribuicao(this.db.origemExecutor, SUBJECT, tenantId, origem, OPCOES);
      await registrarEvento(this.db.origemExecutor, SUBJECT, tenantId, MARCO.cadastrou, {}, OPCOES);
    });
  }

  /**
   * Marca um marco alcançado. Repetir é inofensivo: o banco guarda o primeiro,
   * que é quando o marco de fato aconteceu.
   */
  async marcar(tenantId: string, marco: string, extras: { value?: number | null; currency?: string | null } = {}): Promise<void> {
    await this.silencioso(`marcar ${marco}`, () =>
      registrarEvento(this.db.origemExecutor, SUBJECT, tenantId, marco, extras, OPCOES),
    );
  }

  // ---------------------------------------------------------------- Super Admin

  relatorio(opcoes: OpcoesRelatorio = {}): Promise<LinhaRelatorio[]> {
    return relatorio(this.db.origemExecutor, SUBJECT, { ...OPCOES, ...opcoes });
  }

  lancarGasto(gasto: {
    channel: Channel;
    source: string;
    campaign?: string | null;
    content?: string | null;
    periodStart: Date;
    periodEnd: Date;
    amount: number;
    note?: string | null;
  }): Promise<void> {
    return lancarGasto(this.db.origemExecutor, gasto, OPCOES);
  }

  registrarLink(link: { channel: Channel; source: string; campaign: string; content: string | null; url: string }): Promise<void> {
    return registrarLink(this.db.origemExecutor, link, OPCOES);
  }

  listarLinks(): Promise<CampaignLink[]> {
    return listarLinks(this.db.origemExecutor, OPCOES);
  }

  /**
   * Erro de aquisição vira log, nunca exceção.
   *
   * As chamadas de escrita acontecem no meio de fluxos que valem dinheiro
   * (cadastro, pedido, pagamento confirmado). Nenhum deles pode falhar porque a
   * tabela de marketing estava indisponível.
   */
  private async silencioso(oque: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.log.warn(`aquisição: falha ao ${oque} — ${(err as Error).message}`);
    }
  }
}
