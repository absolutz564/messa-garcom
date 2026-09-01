// GERADO por scripts/sync-origem.mjs — não edite aqui.
// A fonte é o repositório "origem", ao lado deste projeto. Edite lá, rode os
// testes de lá, e sincronize com: node scripts/sync-origem.mjs
import type { Touch, Channel } from "./types";

/**
 * Serialização de toque para cookie.
 *
 * Cookie tem teto de ~4KB por domínio somando todos, e o navegador descarta em
 * silêncio o que passa disso — sem erro, sem aviso. Por isso os campos são
 * abreviados e vão numa lista posicional em vez de um objeto com nomes: o mesmo
 * toque ocupa cerca de um terço do JSON legível.
 *
 * A ordem dos campos é contrato de armazenamento. Acrescente **no fim**; mudar
 * ou remover posição invalida os cookies já gravados nos navegadores dos
 * visitantes, e o dado perdido é justamente o de quem veio antes da mudança.
 */
const CANAIS: Channel[] = [
  "direct",
  "organic_search",
  "organic_social",
  "paid_search",
  "paid_social",
  "referral",
  "email",
  "other",
];

type Serializado = [
  number, // índice do canal
  string, // source
  string, // medium
  string, // campaign
  string, // content
  string, // term
  string, // clickId
  string, // clickIdKind
  string, // landingPath
  string, // referrerHost
  number, // timestamp em segundos
];

function vazioParaNulo(valor: string): string | null {
  return valor === "" ? null : valor;
}

export function serializarToque(toque: Touch): string {
  const dados: Serializado = [
    Math.max(0, CANAIS.indexOf(toque.channel)),
    toque.source ?? "",
    toque.medium ?? "",
    toque.campaign ?? "",
    toque.content ?? "",
    toque.term ?? "",
    toque.clickId ?? "",
    toque.clickIdKind ?? "",
    toque.landingPath ?? "",
    toque.referrerHost ?? "",
    Math.floor(toque.at / 1000),
  ];
  // encodeURIComponent porque valor de cookie não aceita vírgula, ponto e
  // vírgula nem espaço — e campanha com vírgula é comum.
  return encodeURIComponent(JSON.stringify(dados));
}

export function desserializarToque(valor: string | null | undefined): Touch | null {
  if (!valor) return null;
  try {
    const dados = JSON.parse(decodeURIComponent(valor)) as unknown;
    if (!Array.isArray(dados) || dados.length < 11) return null;
    const d = dados as Serializado;
    const canal = CANAIS[d[0]];
    if (!canal) return null;
    return {
      channel: canal,
      source: vazioParaNulo(d[1]),
      medium: vazioParaNulo(d[2]),
      campaign: vazioParaNulo(d[3]),
      content: vazioParaNulo(d[4]),
      term: vazioParaNulo(d[5]),
      clickId: vazioParaNulo(d[6]),
      clickIdKind: vazioParaNulo(d[7]),
      landingPath: vazioParaNulo(d[8]),
      referrerHost: vazioParaNulo(d[9]),
      at: d[10] * 1000,
    };
  } catch {
    // Cookie corrompido ou de versão anterior do formato: tratar como ausente é
    // melhor que derrubar o cadastro de alguém por causa de um dado de marketing.
    return null;
  }
}

/** Lê um par de cookies de uma string `Cookie:` ou de `document.cookie`. */
export function lerCookie(header: string | null | undefined, nome: string): string | null {
  if (!header) return null;
  for (const parte of header.split(";")) {
    const igual = parte.indexOf("=");
    if (igual === -1) continue;
    if (parte.slice(0, igual).trim() === nome) {
      return parte.slice(igual + 1).trim();
    }
  }
  return null;
}

export function nomesDeCookie(prefixo = "og") {
  return { primeiro: `${prefixo}_ft`, ultimo: `${prefixo}_lt` };
}
