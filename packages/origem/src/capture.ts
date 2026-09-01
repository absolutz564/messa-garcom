// GERADO por scripts/sync-origem.mjs — não edite aqui.
// A fonte é o repositório "origem", ao lado deste projeto. Edite lá, rode os
// testes de lá, e sincronize com: node scripts/sync-origem.mjs
import { classify, deveSubstituirUltimoToque } from "./classify";
import { serializarToque, desserializarToque, lerCookie, nomesDeCookie } from "./cookies";
import type { CaptureOptions, Touch } from "./types";

/**
 * Captura no navegador.
 *
 * Roda **uma vez por carregamento de página**, o mais cedo possível. Precisa ser
 * no navegador e não no servidor porque `document.referrer` só existe aqui — no
 * servidor, o cabeçalho Referer é omitido por boa parte dos navegadores em
 * navegação entre sites, que é exatamente o caso que interessa medir.
 *
 * Grava cookie de primeira parte, sem httpOnly, porque quem escreve é este
 * código. Isso significa que o valor é legível por qualquer script da página —
 * aceitável, já que o conteúdo é a própria campanha que trouxe a pessoa, e não
 * segredo. Nada de identificador pessoal entra aqui.
 */
export function capturar(options: CaptureOptions = {}): { primeiro: Touch; ultimo: Touch } | null {
  if (typeof document === "undefined" || typeof window === "undefined") return null;

  const {
    internalHosts = [],
    firstTouchDays = 180,
    lastTouchDays = 90,
    cookiePrefix = "og",
  } = options;

  const toque = classify({
    url: window.location.href,
    referrer: document.referrer || null,
    internalHosts,
  });
  if (!toque) return null;

  const nomes = nomesDeCookie(cookiePrefix);
  const primeiroAtual = desserializarToque(lerCookie(document.cookie, nomes.primeiro));
  const ultimoAtual = desserializarToque(lerCookie(document.cookie, nomes.ultimo));

  /*
   * O primeiro toque nunca é reescrito. Mesmo quando ele foi "direto": se a
   * pessoa chegou digitando o endereço e só depois clicou num anúncio, foi
   * alguma outra coisa que a apresentou ao produto — e sobrescrever apagaria a
   * única pista de que o anúncio não fez a descoberta, apenas a conversão.
   */
  const primeiro = primeiroAtual ?? toque;
  if (!primeiroAtual) {
    gravarCookie(nomes.primeiro, serializarToque(toque), firstTouchDays);
  }

  const ultimo = deveSubstituirUltimoToque(ultimoAtual, toque) ? toque : (ultimoAtual ?? primeiro);
  if (deveSubstituirUltimoToque(ultimoAtual, toque)) {
    gravarCookie(nomes.ultimo, serializarToque(toque), lastTouchDays);
  }

  return { primeiro, ultimo };
}

function gravarCookie(nome: string, valor: string, dias: number): void {
  const expira = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toUTCString();
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  // SameSite=Lax e não Strict: com Strict o cookie não é enviado na primeira
  // navegação vinda de outro site, que é justamente quando o anúncio traz a
  // pessoa — o toque seria gravado e depois ignorado no cadastro.
  document.cookie = `${nome}=${valor}; Path=/; Expires=${expira}; SameSite=Lax${seguro}`;
}

/**
 * Apaga os cookies de origem.
 *
 * Necessário para atender pedido de exclusão (LGPD, art. 18) e para testar sem
 * abrir janela anônima toda vez.
 */
export function esquecer(cookiePrefix = "og"): void {
  if (typeof document === "undefined") return;
  const nomes = nomesDeCookie(cookiePrefix);
  for (const nome of [nomes.primeiro, nomes.ultimo]) {
    document.cookie = `${nome}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  }
}
