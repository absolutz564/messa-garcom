// GERADO por scripts/sync-origem.mjs — não edite aqui.
// A fonte é o repositório "origem", ao lado deste projeto. Edite lá, rode os
// testes de lá, e sincronize com: node scripts/sync-origem.mjs
import { desserializarToque, lerCookie, nomesDeCookie } from "./cookies";
import type { Attribution, Touch } from "./types";

const TOQUE_DESCONHECIDO: Touch = {
  channel: "direct",
  source: null,
  medium: null,
  campaign: null,
  content: null,
  term: null,
  clickId: null,
  clickIdKind: null,
  landingPath: null,
  referrerHost: null,
  at: 0,
};

/**
 * Lê a origem no servidor, na hora de gravar o cadastro.
 *
 * Aceita o cabeçalho `Cookie` cru para não depender de framework: em Next serve
 * `request.headers.get("cookie")`, em Express `req.headers.cookie`, e em teste
 * uma string qualquer.
 *
 * Devolve sempre um objeto, nunca `null`. Cadastro sem origem conhecida é
 * "direto" — e "direto" é uma resposta legítima, não uma falha. Fazer esta
 * função devolver nulo empurraria cada chamador a inventar o seu próprio
 * tratamento, e algum deles acabaria deixando a exceção subir e derrubar o
 * cadastro por causa de um dado de marketing.
 */
export function lerOrigem(cookieHeader: string | null | undefined, cookiePrefix = "og"): Attribution {
  const nomes = nomesDeCookie(cookiePrefix);
  const primeiro = desserializarToque(lerCookie(cookieHeader, nomes.primeiro));
  const ultimo = desserializarToque(lerCookie(cookieHeader, nomes.ultimo));

  return {
    first: primeiro ?? ultimo ?? TOQUE_DESCONHECIDO,
    last: ultimo ?? primeiro ?? TOQUE_DESCONHECIDO,
  };
}

/** Achata a atribuição em colunas, para gravar em uma linha de tabela. */
export function paraColunas(atribuicao: Attribution) {
  return {
    firstChannel: atribuicao.first.channel,
    firstSource: atribuicao.first.source,
    firstMedium: atribuicao.first.medium,
    firstCampaign: atribuicao.first.campaign,
    firstContent: atribuicao.first.content,
    firstTerm: atribuicao.first.term,
    firstClickId: atribuicao.first.clickId,
    firstClickIdKind: atribuicao.first.clickIdKind,
    firstLandingPath: atribuicao.first.landingPath,
    firstReferrerHost: atribuicao.first.referrerHost,
    firstAt: atribuicao.first.at > 0 ? new Date(atribuicao.first.at) : null,

    lastChannel: atribuicao.last.channel,
    lastSource: atribuicao.last.source,
    lastMedium: atribuicao.last.medium,
    lastCampaign: atribuicao.last.campaign,
    lastContent: atribuicao.last.content,
    lastTerm: atribuicao.last.term,
    lastClickId: atribuicao.last.clickId,
    lastClickIdKind: atribuicao.last.clickIdKind,
    lastLandingPath: atribuicao.last.landingPath,
    lastReferrerHost: atribuicao.last.referrerHost,
    lastAt: atribuicao.last.at > 0 ? new Date(atribuicao.last.at) : null,
  };
}
