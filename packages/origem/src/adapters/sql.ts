// GERADO por scripts/sync-origem.mjs — não edite aqui.
// A fonte é o repositório "origem", ao lado deste projeto. Edite lá, rode os
// testes de lá, e sincronize com: node scripts/sync-origem.mjs
import { paraColunas } from "../read";
import { montarRelatorio } from "../report";
import type { Attribution, Channel, CampaignLink } from "../types";
import type { LinhaRelatorio, OpcoesRelatorio, SujeitoAtribuido } from "../report";

/**
 * Adaptador para qualquer cliente Postgres que aceite SQL parametrizado.
 *
 * Serve Drizzle, Kysely, `pg` e `postgres.js` com o mesmo código. É SQL cru, e
 * não um ORM, porque esta biblioteca não tem dependências: importar `drizzle-orm`
 * aqui obrigaria todo projeto que só quer o `pg` a instalar um ORM inteiro, e
 * ainda casaria a versão da biblioteca com a do ORM de cada app — o mesmo motivo
 * pelo qual o adaptador do Prisma se contenta com um contrato mínimo em vez de
 * importar o `PrismaClient`.
 *
 * Ligar num Drizzle sobre postgres.js:
 *
 * ```ts
 * const executor = { query: (sql, params) => client.unsafe(sql, params) };
 * ```
 */
export interface Executor {
  /** Executa SQL com placeholders `$1, $2...` e devolve as linhas. */
  query(sql: string, params: unknown[]): Promise<Array<Record<string, unknown>>>;
}

export interface OpcoesSql {
  /**
   * Nomes das tabelas. O padrão é o do `prisma/migration.sql` que acompanha a
   * biblioteca; projetos em snake_case costumam querer `origem_atribuicao` etc.
   */
  tabelas?: { atribuicao?: string; evento?: string; gasto?: string; link?: string };
  /**
   * Convenção das colunas. `"camel"` usa `"firstChannel"` entre aspas, como o
   * migration da biblioteca; `"snake"` converte para `first_channel`.
   */
  colunas?: "camel" | "snake";
  /**
   * Gerador do `id`. O migration declara `id TEXT PRIMARY KEY` sem default,
   * então alguém precisa fornecer o valor. O padrão usa `crypto.randomUUID`.
   */
  novoId?: () => string;
}

const PADRAO = {
  atribuicao: "OrigemAtribuicao",
  evento: "OrigemEvento",
  gasto: "OrigemGasto",
  link: "OrigemLink",
} as const;

/**
 * Identificador só pode conter letra, número e sublinhado.
 *
 * Nome de tabela e de coluna não são parametrizáveis em SQL: entram no texto da
 * consulta. Vêm da configuração do desenvolvedor, não do usuário final, mas uma
 * configuração montada a partir de variável de ambiente já bastaria para virar
 * injeção — e o custo de conferir é uma expressão regular.
 */
function identificador(nome: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nome)) {
    throw new Error(`Nome inválido para tabela ou coluna: ${JSON.stringify(nome)}`);
  }
  return `"${nome}"`;
}

function paraSnake(nome: string): string {
  return nome.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`);
}

class Dialeto {
  readonly tabelas: { atribuicao: string; evento: string; gasto: string; link: string };
  private readonly snake: boolean;
  readonly novoId: () => string;

  constructor(opcoes: OpcoesSql = {}) {
    this.tabelas = { ...PADRAO, ...opcoes.tabelas };
    this.snake = opcoes.colunas === "snake";
    this.novoId = opcoes.novoId ?? (() => globalThis.crypto.randomUUID());
  }

  /** Nome canônico (camelCase) → identificador citado, na convenção do projeto. */
  col(nome: string): string {
    return identificador(this.snake ? paraSnake(nome) : nome);
  }

  tabela(qual: keyof Dialeto["tabelas"]): string {
    return identificador(this.tabelas[qual]);
  }
}

/**
 * Grava a origem de um sujeito recém-criado.
 *
 * `ON CONFLICT ... DO UPDATE` e não `INSERT` puro: se o cadastro repetir por
 * clique duplo ou retry, a segunda gravação não pode explodir por chave única e
 * derrubar a criação da conta. Atualiza o **último** toque e preserva o
 * **primeiro** — a descoberta aconteceu uma vez só.
 */
export async function gravarAtribuicao(
  db: Executor,
  subjectType: string,
  subjectId: string,
  atribuicao: Attribution,
  opcoes: OpcoesSql = {}
): Promise<void> {
  const d = new Dialeto(opcoes);
  const colunas = paraColunas(atribuicao);
  const nomes = Object.keys(colunas) as Array<keyof typeof colunas>;
  const valores = nomes.map((n) => colunas[n]);

  const insercao = ["id", "subjectType", "subjectId", ...nomes];
  const params: unknown[] = [d.novoId(), subjectType, subjectId, ...valores];
  const marcadores = params.map((_, i) => `$${i + 1}`);

  // Só o último toque é atualizado; as colunas `first*` ficam como entraram.
  const atualizaveis = nomes.filter((n) => String(n).startsWith("last"));
  const set = atualizaveis.map((n) => `${d.col(String(n))} = EXCLUDED.${d.col(String(n))}`).join(", ");

  await db.query(
    `INSERT INTO ${d.tabela("atribuicao")} (${insercao.map((n) => d.col(n)).join(", ")})
     VALUES (${marcadores.join(", ")})
     ON CONFLICT (${d.col("subjectType")}, ${d.col("subjectId")}) DO UPDATE SET ${set}`,
    params
  );
}

/**
 * Registra um marco.
 *
 * `DO NOTHING` em vez de erro: marcar "pagou" duas vezes não é falha do
 * chamador, é a mesma verdade dita de novo. E o primeiro registro é o que vale —
 * é quando o marco de fato aconteceu.
 */
export async function registrarEvento(
  db: Executor,
  subjectType: string,
  subjectId: string,
  name: string,
  extras: { value?: number | null; currency?: string | null; occurredAt?: Date } = {},
  opcoes: OpcoesSql = {}
): Promise<void> {
  const d = new Dialeto(opcoes);
  await db.query(
    `INSERT INTO ${d.tabela("evento")}
       (${d.col("id")}, ${d.col("subjectType")}, ${d.col("subjectId")}, ${d.col("name")},
        ${d.col("value")}, ${d.col("currency")}, ${d.col("occurredAt")})
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (${d.col("subjectType")}, ${d.col("subjectId")}, ${d.col("name")}) DO NOTHING`,
    [
      d.novoId(),
      subjectType,
      subjectId,
      name,
      extras.value ?? null,
      extras.currency ?? null,
      extras.occurredAt ?? new Date(),
    ]
  );
}

export async function lancarGasto(
  db: Executor,
  gasto: {
    channel: Channel;
    source: string;
    campaign?: string | null;
    content?: string | null;
    periodStart: Date;
    periodEnd: Date;
    amount: number;
    currency?: string;
    note?: string | null;
  },
  opcoes: OpcoesSql = {}
): Promise<void> {
  const d = new Dialeto(opcoes);
  await db.query(
    `INSERT INTO ${d.tabela("gasto")}
       (${d.col("id")}, ${d.col("channel")}, ${d.col("source")}, ${d.col("campaign")}, ${d.col("content")},
        ${d.col("periodStart")}, ${d.col("periodEnd")}, ${d.col("amount")}, ${d.col("currency")}, ${d.col("note")})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      d.novoId(),
      gasto.channel,
      gasto.source,
      gasto.campaign ?? null,
      gasto.content ?? null,
      gasto.periodStart,
      gasto.periodEnd,
      gasto.amount,
      gasto.currency ?? "BRL",
      gasto.note ?? null,
    ]
  );
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

/**
 * NUMERIC do Postgres chega como string na maioria dos drivers — `Number()` de
 * `null` daria 0 por acidente, então o caso nulo é tratado antes.
 */
function numero(valor: unknown): number {
  if (valor == null) return 0;
  const n = Number(typeof valor === "object" ? String(valor) : valor);
  return Number.isFinite(n) ? n : 0;
}

/** Lê tudo do banco e devolve o relatório pronto. */
export async function relatorio(
  db: Executor,
  subjectType: string,
  opcoes: OpcoesRelatorio & OpcoesSql = {}
): Promise<LinhaRelatorio[]> {
  const d = new Dialeto(opcoes);
  const [atribuicoes, eventos, gastos] = await Promise.all([
    db.query(`SELECT * FROM ${d.tabela("atribuicao")} WHERE ${d.col("subjectType")} = $1`, [subjectType]),
    db.query(`SELECT * FROM ${d.tabela("evento")} WHERE ${d.col("subjectType")} = $1`, [subjectType]),
    db.query(`SELECT * FROM ${d.tabela("gasto")}`, []),
  ]);

  // A leitura devolve as colunas na convenção do banco; o resto da biblioteca
  // fala camelCase. A tradução acontece aqui, e só aqui.
  const chave = (linha: Record<string, unknown>, nome: string) =>
    linha[nome] !== undefined ? linha[nome] : linha[paraSnake(nome)];

  const porSujeito = new Map<string, { marcos: string[]; receita: number }>();
  for (const evento of eventos) {
    const id = String(chave(evento, "subjectId"));
    const atual = porSujeito.get(id) ?? { marcos: [], receita: 0 };
    atual.marcos.push(String(chave(evento, "name")));
    atual.receita += numero(chave(evento, "value"));
    porSujeito.set(id, atual);
  }

  const sujeitos: SujeitoAtribuido[] = atribuicoes.map((linha) => {
    const id = String(chave(linha, "subjectId"));
    const extra = porSujeito.get(id) ?? { marcos: [], receita: 0 };
    return {
      subjectId: id,
      marcos: extra.marcos,
      receita: extra.receita,
      atribuicao: {
        first: reconstruirToque(linha, "first", chave),
        last: reconstruirToque(linha, "last", chave),
      },
    };
  });

  return montarRelatorio(
    sujeitos,
    gastos.map((g) => ({
      channel: String(chave(g, "channel")) as Channel,
      source: String(chave(g, "source")),
      campaign: texto(chave(g, "campaign")),
      content: texto(chave(g, "content")),
      periodStart: new Date(String(chave(g, "periodStart"))),
      periodEnd: new Date(String(chave(g, "periodEnd"))),
      amount: numero(chave(g, "amount")),
      currency: String(chave(g, "currency") ?? "BRL"),
    })),
    opcoes
  );
}

function reconstruirToque(
  linha: Record<string, unknown>,
  prefixo: "first" | "last",
  chave: (linha: Record<string, unknown>, nome: string) => unknown
) {
  const at = chave(linha, `${prefixo}At`);
  return {
    channel: String(chave(linha, `${prefixo}Channel`) ?? "direct") as Channel,
    source: texto(chave(linha, `${prefixo}Source`)),
    medium: texto(chave(linha, `${prefixo}Medium`)),
    campaign: texto(chave(linha, `${prefixo}Campaign`)),
    content: texto(chave(linha, `${prefixo}Content`)),
    term: texto(chave(linha, `${prefixo}Term`)),
    clickId: texto(chave(linha, `${prefixo}ClickId`)),
    clickIdKind: texto(chave(linha, `${prefixo}ClickIdKind`)),
    landingPath: texto(chave(linha, `${prefixo}LandingPath`)),
    referrerHost: texto(chave(linha, `${prefixo}ReferrerHost`)),
    at: at ? new Date(String(at)).getTime() : 0,
  };
}

/**
 * Guarda um link de anúncio criado, se ainda não existir.
 *
 * Lê antes de inserir em vez de confiar num `ON CONFLICT`: a identidade do link
 * inclui `content`, que pode ser nulo, e o Postgres trata nulos como distintos
 * em índice único — dois links sem criativo passariam como registros diferentes.
 */
export async function registrarLink(
  db: Executor,
  link: { channel: Channel; source: string; campaign: string; content: string | null; url: string },
  opcoes: OpcoesSql = {}
): Promise<void> {
  const d = new Dialeto(opcoes);
  const existentes = await db.query(
    `SELECT ${d.col("content")} FROM ${d.tabela("link")} WHERE ${d.col("source")} = $1 AND ${d.col("campaign")} = $2`,
    [link.source, link.campaign]
  );
  const jaExiste = existentes.some((l) => texto(l[Object.keys(l)[0]!]) === link.content);
  if (jaExiste) return;

  try {
    await db.query(
      `INSERT INTO ${d.tabela("link")}
         (${d.col("id")}, ${d.col("channel")}, ${d.col("source")}, ${d.col("campaign")}, ${d.col("content")}, ${d.col("url")})
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [d.novoId(), link.channel, link.source, link.campaign, link.content, link.url]
    );
  } catch {
    // Duas abas gerando o mesmo link ao mesmo tempo: o índice único barra a
    // segunda. Não é erro de quem usa, e o link dele já está pronto.
  }
}

/** Links já criados, do mais recente para o mais antigo. */
export async function listarLinks(db: Executor, opcoes: OpcoesSql = {}): Promise<CampaignLink[]> {
  const d = new Dialeto(opcoes);
  const linhas = await db.query(
    `SELECT * FROM ${d.tabela("link")} ORDER BY ${d.col("createdAt")} DESC LIMIT 200`,
    []
  );
  const chave = (linha: Record<string, unknown>, nome: string) =>
    linha[nome] !== undefined ? linha[nome] : linha[paraSnake(nome)];

  return linhas.map((l) => ({
    channel: String(chave(l, "channel")) as Channel,
    source: String(chave(l, "source")),
    campaign: String(chave(l, "campaign")),
    content: texto(chave(l, "content")),
    url: String(chave(l, "url")),
    createdAt: new Date(String(chave(l, "createdAt"))),
  }));
}
