/**
 * BR-23 — alcance do cookie de origem.
 *
 * O site (`messa-garcom.com.br`) e a API que grava a atribuição
 * (`api.messa-garcom.com.br`) são hosts diferentes. Cookie sem `Domain` é
 * *host-only*: o navegador o envia apenas para o host exato que o gravou, e a
 * requisição de cadastro chega à API sem origem nenhuma — todo cadastro vira
 * "direto", sem erro, sem log, sem exceção.
 *
 * Em desenvolvimento o problema não aparece: `localhost:3000` e `localhost:3001`
 * são o mesmo host para efeito de cookie (a porta é ignorada). Por isso a função
 * é derivada da topologia em vez de configurada — uma variável de ambiente a
 * mais seria mais uma coisa certa em produção e errada em qualquer preview.
 */
export function attributionCookieDomain(webHost: string, apiHost: string): string | undefined {
  const web = normalizarHost(webHost);
  const api = normalizarHost(apiHost);
  if (!web || !api) return undefined;

  // Mesmo host (dev, ou API atrás do mesmo domínio): host-only já funciona, e
  // alargar o alcance sem precisar é dar a subdomínios um dado que não é deles.
  if (web === api) return undefined;

  // A API é subdomínio do site: `Domain=<site>` cobre os dois. É o caso de
  // produção — e o único em que dá para afirmar o domínio pai sem consultar a
  // Public Suffix List, porque o próprio host atual já é esse domínio.
  if (api.endsWith(`.${web}`)) return web;

  /*
   * Site e API em ramos irmãos (`www.x.com.br` e `api.x.com.br`), ou hosts sem
   * parentesco (preview da Vercel apontando para a API de produção). Subir ao
   * pai comum exigiria saber onde termina o sufixo público — `.com.br` seria
   * recusado pelo navegador, e um palpite errado descarta o cookie em silêncio.
   * Devolver host-only perde a atribuição, o que é ruim; devolver um domínio
   * inválido perde o cookie inteiro, o que é pior e mais difícil de perceber.
   */
  return undefined;
}

function normalizarHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}
