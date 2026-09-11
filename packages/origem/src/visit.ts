// GERADO por scripts/sync-origem.mjs — não edite aqui.
// A fonte é o repositório "origem", ao lado deste projeto. Edite lá, rode os
// testes de lá, e sincronize com: node scripts/sync-origem.mjs
import { CANAIS } from "./cookies";
import type { Channel, ResultadoDaCaptura, Visita } from "./types";

/**
 * Teto por campo. Uma campanha real tem dezenas de caracteres; o que passa disto
 * não é marcação, é alguém testando o que a rota pública engole.
 */
const TAMANHO_MAXIMO = 200;

/** O que `visitaDe` aceita: um `Touch`, ou o corpo cru de uma requisição. */
export interface EntradaDeVisita {
  channel?: unknown;
  source?: unknown;
  medium?: unknown;
  campaign?: unknown;
  content?: unknown;
  landingPath?: unknown;
}

/**
 * Decide se a visita atual deve ser contada, e o que gravar dela.
 *
 * Duas formas óbvias de estragar a contagem, e esta função fecha as duas:
 *
 * 1. **Contar a mesma pessoa mais de uma vez.** Quem abre o link e navega por
 *    quatro páginas viraria quatro cliques, e um afiliado com dois visitantes
 *    apareceria com oito. Só conta quando `novo` é verdadeiro — o cookie do
 *    primeiro toque acabou de ser gravado, e ele é o que diz que já houve um.
 *
 * 2. **Contar quem nunca viu o link.** Visita direta — alguém digitando o
 *    endereço — não pode entrar na conta de ninguém.
 *
 * Função pura de propósito: recebe o resultado da captura, devolve o que
 * gravar ou `null`. Quem chama é o rastreador no navegador; quem grava é a
 * rota do app com o adaptador. Nenhum dos dois precisa reimplementar a regra.
 */
export function visitaParaContar(captura: Pick<ResultadoDaCaptura, "primeiro" | "novo"> | null): Visita | null {
  if (!captura || !captura.novo) return null;
  return visitaDe(captura.primeiro);
}

/**
 * Projeção de um toque — ou do corpo cru de uma requisição — para o que a
 * tabela de visitas guarda.
 *
 * Separada de `visitaParaContar` porque o servidor também precisa dela: a rota
 * que recebe a visita é pública, e o corpo pode trazer qualquer coisa. Esta
 * função é a lista fechada do que entra: só estes seis campos, só string ou
 * nulo, só canal conhecido, só até `TAMANHO_MAXIMO`. IP e user agent não têm
 * por onde chegar à tabela — nem por descuido de quem monta o corpo.
 *
 * Devolve `null` em vez de lançar: contar visita não é serviço prestado a quem
 * visita, e a rota deve responder o mesmo 204 para o corpo bom e para o ruim.
 */
export function visitaDe(entrada: EntradaDeVisita): Visita | null {
  const channel = texto(entrada.channel);
  if (!channel || !CANAIS.includes(channel as Channel)) return null;
  // Quem digitou o endereço não clicou em link de divulgação nenhum.
  if (channel === "direct") return null;

  const campos = {
    source: texto(entrada.source),
    medium: texto(entrada.medium),
    campaign: texto(entrada.campaign),
    content: texto(entrada.content),
    landingPath: semQuery(texto(entrada.landingPath)),
  };
  if (Object.values(campos).some((v) => v !== null && v.length > TAMANHO_MAXIMO)) return null;

  return { channel: channel as Channel, ...campos };
}

/** String não vazia, ou nulo. Qualquer outro tipo (número, objeto, array) é nulo. */
function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

/** Sem query string: ela aceita qualquer coisa que alguém cole no link. */
function semQuery(caminho: string | null): string | null {
  if (!caminho) return null;
  const limpo = caminho.split("?")[0]!.split("#")[0]!;
  return limpo.length > 0 ? limpo : null;
}
