import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { schema, type DbHandle } from '@messa/db';
import { campaignShortCode } from '@messa/domain';
import { lerOrigem } from '@messa/origem';
import { gravarAtribuicao, lancarGasto, registrarEvento, relatorio } from '@messa/origem/dist/adapters/sql';
import type { Attribution, Channel, LinhaRelatorio, OpcoesRelatorio } from '@messa/origem';
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
    // Quem chama deve **esperar**, mesmo sendo best-effort: disparar sem aguardar
    // deixa o marco chegar depois da resposta HTTP, e o relatório passa a depender
    // de sorte. O erro já é engolido aqui dentro, então esperar não arrisca nada —
    // custa poucos milissegundos e torna o comportamento determinístico.
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

  // ------------------------------------------------------------ Links de anúncio
  //
  // Estes três não usam o adaptador da biblioteca `origem` (que os tem) porque
  // ela não conhece o código curto: o `CampaignLink` de lá não tem `slug`, e
  // adicioná-lo obrigaria a mudar a biblioteca e o Terap-IA Kids junto. Aqui as
  // tabelas são do Drizzle e já estão tipadas — o SQL cru não traria nada.

  /**
   * Guarda o link do anúncio e devolve o código curto de `/i/<slug>` (BR-23).
   *
   * Repetir a mesma origem/campanha/peça devolve o link já existente em vez de
   * criar outro — é o que mantém a lista curta e o nome da campanha estável
   * entre a criação do anúncio e o lançamento do gasto, semanas depois. Link
   * antigo que ainda não tem código ganha um aqui: é assim que os criados antes
   * do encurtador passam a ter link curto, sem migração de dados.
   */
  async registrarLink(link: NovoLink): Promise<LinkSalvo> {
    const existente = await this.buscarLink(link);
    if (existente?.slug) return paraLinkSalvo(existente);

    // Uma transação por tentativa: violar índice único aborta a transação
    // inteira no Postgres, então não dá para tentar o próximo código dentro dela.
    for (let tentativa = 0; tentativa < 20; tentativa++) {
      const slug = campaignShortCode(link.source, tentativa);
      try {
        const [linha] = await this.db.withPlatformTx((tx) =>
          existente
            ? tx.update(schema.origemLink).set({ slug }).where(eq(schema.origemLink.id, existente.id)).returning()
            : tx.insert(schema.origemLink).values({ id: uuidv7(), ...link, slug }).returning(),
        );
        if (linha) return paraLinkSalvo(linha);
      } catch {
        // Código já usado por outro link (ou duas abas gerando ao mesmo tempo).
        // O índice único é quem decide; tenta o próximo.
      }
    }

    // Vinte códigos tomados para a mesma origem é improvável, mas não pode
    // custar o link: sem código, o longo continua correto e rastreado.
    this.log.warn(`aquisição: sem código curto livre para "${link.source}" — link segue só com a URL longa`);
    if (existente) return paraLinkSalvo(existente);
    const [criado] = await this.db.withPlatformTx((tx) =>
      tx.insert(schema.origemLink).values({ id: uuidv7(), ...link, slug: null }).returning(),
    );
    return paraLinkSalvo(criado!);
  }

  async listarLinks(): Promise<LinkSalvo[]> {
    const linhas = await this.db.withPlatformTx((tx) =>
      tx.select().from(schema.origemLink).orderBy(desc(schema.origemLink.createdAt)).limit(200),
    );
    return linhas.map(paraLinkSalvo);
  }

  /**
   * Destino de um código curto. `null` quando não existe — quem chama decide o
   * que fazer com isso (a rota `/i/<slug>` leva à landing, nunca a um 404).
   */
  async destinoDoCodigo(slug: string): Promise<string | null> {
    const [linha] = await this.db.withPlatformTx((tx) =>
      tx.select({ url: schema.origemLink.url }).from(schema.origemLink).where(eq(schema.origemLink.slug, slug)).limit(1),
    );
    return linha?.url ?? null;
  }

  /** O link é identificado por origem + campanha + peça (mesmo índice único do banco). */
  private async buscarLink(link: NovoLink): Promise<typeof schema.origemLink.$inferSelect | undefined> {
    const [linha] = await this.db.withPlatformTx((tx) =>
      tx
        .select()
        .from(schema.origemLink)
        .where(
          and(
            eq(schema.origemLink.source, link.source),
            eq(schema.origemLink.campaign, link.campaign),
            link.content === null ? isNull(schema.origemLink.content) : eq(schema.origemLink.content, link.content),
          ),
        )
        .limit(1),
    );
    return linha;
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

export interface NovoLink {
  channel: Channel;
  source: string;
  campaign: string;
  content: string | null;
  url: string;
}

export interface LinkSalvo extends NovoLink {
  slug: string | null;
  createdAt: Date;
}

function paraLinkSalvo(linha: typeof schema.origemLink.$inferSelect): LinkSalvo {
  return {
    channel: linha.channel as Channel,
    source: linha.source,
    campaign: linha.campaign,
    content: linha.content,
    url: linha.url,
    slug: linha.slug,
    createdAt: linha.createdAt,
  };
}
