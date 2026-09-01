// GERADO por scripts/sync-origem.mjs — não edite aqui.
// A fonte é o repositório "origem", ao lado deste projeto. Edite lá, rode os
// testes de lá, e sincronize com: node scripts/sync-origem.mjs
import type { AdSpend, Attribution, Channel } from "./types";

/** Uma pessoa/empresa adquirida, com a origem e o que aconteceu depois. */
export interface SujeitoAtribuido {
  subjectId: string;
  atribuicao: Pick<Attribution, "first" | "last">;
  /** Nomes dos marcos alcançados: "signup", "ativou", "pagou"... */
  marcos: string[];
  /** Receita reconhecida até agora, na moeda do gasto. */
  receita: number;
}

export interface LinhaRelatorio {
  chave: string;
  channel: Channel;
  source: string | null;
  campaign: string | null;
  /** Peça específica do anúncio (`utm_content`), quando agrupado por ela. */
  content: string | null;
  cadastros: number;
  /** Quantos alcançaram o marco de ativação configurado. */
  ativados: number;
  /** Quantos alcançaram o marco de pagamento configurado. */
  pagantes: number;
  receita: number;
  gasto: number;
  /** Gasto ÷ pagantes. `null` quando ninguém pagou ainda. */
  cac: number | null;
  /** Gasto ÷ cadastros — útil bem antes de existir pagante. */
  custoPorCadastro: number | null;
  /** Receita ÷ gasto. `null` sem gasto lançado. */
  retorno: number | null;
  taxaAtivacao: number | null;
  taxaPagamento: number | null;
}

export interface OpcoesRelatorio {
  /** "first" credita quem descobriu; "last" credita quem converteu. Padrão "last". */
  modelo?: "first" | "last";
  /**
   * Agrupamento. Padrão "campaign".
   *
   * "content" separa peça a peça dentro da campanha. É o nível em que a
   * plataforma de anúncio **não** ajuda: ela informa cliques e visualizações
   * por anúncio, mas não sabe quais viraram cliente pagante — e é comum a peça
   * de maior alcance ser a de pior conversão.
   */
  agruparPor?: "channel" | "source" | "campaign" | "content";
  marcoAtivacao?: string;
  marcoPagamento?: string;
}

function chaveDe(
  channel: Channel,
  source: string | null,
  campaign: string | null,
  content: string | null,
  agruparPor: NonNullable<OpcoesRelatorio["agruparPor"]>
): string {
  if (agruparPor === "channel") return channel;
  if (agruparPor === "source") return `${channel} / ${source ?? "—"}`;
  if (agruparPor === "campaign") return `${channel} / ${source ?? "—"} / ${campaign ?? "—"}`;
  return `${channel} / ${source ?? "—"} / ${campaign ?? "—"} / ${content ?? "—"}`;
}

function divide(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

/**
 * Cruza pessoas adquiridas com gasto lançado e devolve o custo por canal.
 *
 * Função pura de propósito: recebe listas, devolve listas, não conhece banco.
 * O que decide verba precisa ser verificável sem subir infraestrutura, e a
 * aritmética de custo por cliente é onde erro passa despercebido por semanas —
 * ninguém confere uma divisão que já veio com aparência de relatório.
 *
 * Duas escolhas que mudam a leitura:
 *
 * - **Sem pagante, `cac` é `null`, nunca zero.** Zero se soma e se ordena como
 *   se fosse ótimo; nulo obriga a tela a dizer "ainda não dá para saber". No
 *   começo de qualquer campanha, essa é a resposta honesta.
 * - **Gasto sem cadastro aparece na lista.** É a linha mais importante do
 *   relatório e a mais fácil de sumir: se só entram grupos que tiveram
 *   conversão, a campanha que consumiu verba e não trouxe ninguém desaparece
 *   justamente por ter fracassado.
 */
export function montarRelatorio(
  sujeitos: SujeitoAtribuido[],
  gastos: AdSpend[],
  opcoes: OpcoesRelatorio = {}
): LinhaRelatorio[] {
  const {
    modelo = "last",
    agruparPor = "campaign",
    marcoAtivacao = "ativou",
    marcoPagamento = "pagou",
  } = opcoes;

  const linhas = new Map<string, LinhaRelatorio>();

  function obter(
    channel: Channel,
    source: string | null,
    campaign: string | null,
    content: string | null
  ): LinhaRelatorio {
    const chave = chaveDe(channel, source, campaign, content, agruparPor);
    let linha = linhas.get(chave);
    if (!linha) {
      linha = {
        chave,
        channel,
        source: agruparPor === "channel" ? null : source,
        campaign: agruparPor === "campaign" || agruparPor === "content" ? campaign : null,
        content: agruparPor === "content" ? content : null,
        cadastros: 0,
        ativados: 0,
        pagantes: 0,
        receita: 0,
        gasto: 0,
        cac: null,
        custoPorCadastro: null,
        retorno: null,
        taxaAtivacao: null,
        taxaPagamento: null,
      };
      linhas.set(chave, linha);
    }
    return linha;
  }

  for (const sujeito of sujeitos) {
    const toque = modelo === "first" ? sujeito.atribuicao.first : sujeito.atribuicao.last;
    const linha = obter(toque.channel, toque.source, toque.campaign, toque.content);
    linha.cadastros += 1;
    if (sujeito.marcos.includes(marcoAtivacao)) linha.ativados += 1;
    if (sujeito.marcos.includes(marcoPagamento)) linha.pagantes += 1;
    linha.receita += sujeito.receita;
  }

  for (const gasto of gastos) {
    // `content` no gasto é opcional: quem lança um valor por campanha continua
    // vendo custo por cliente ao agrupar por campanha, e vê a peça sem gasto ao
    // agrupar por criativo. Para ter custo por criativo é preciso lançar o gasto
    // separado por peça — número que o gerenciador de anúncios já mostra.
    const linha = obter(gasto.channel, gasto.source, gasto.campaign, gasto.content ?? null);
    linha.gasto += gasto.amount;
  }

  for (const linha of linhas.values()) {
    linha.cac = linha.gasto > 0 ? divide(linha.gasto, linha.pagantes) : null;
    linha.custoPorCadastro = linha.gasto > 0 ? divide(linha.gasto, linha.cadastros) : null;
    linha.retorno = divide(linha.receita, linha.gasto);
    linha.taxaAtivacao = divide(linha.ativados, linha.cadastros);
    linha.taxaPagamento = divide(linha.pagantes, linha.cadastros);
  }

  // Maior gasto primeiro: é onde o dinheiro está indo, e portanto onde uma
  // decisão errada custa mais. Empate desfeito por cadastros.
  return [...linhas.values()].sort((a, b) => b.gasto - a.gasto || b.cadastros - a.cadastros);
}

/**
 * Diz quantos clientes ainda faltam para um grupo alcançar significância.
 *
 * Existe porque a tentação, com duas semanas de campanha, é declarar vencedor o
 * canal que trouxe 3 clientes contra 2 — diferença que o acaso produz sem
 * dificuldade. A regra prática adotada é 30 conversões por grupo antes de mover
 * verba; abaixo disso o relatório deve dizer que ainda não sabe.
 */
export function faltamParaDecidir(linha: LinhaRelatorio, minimo = 30): number {
  return Math.max(0, minimo - linha.pagantes);
}
