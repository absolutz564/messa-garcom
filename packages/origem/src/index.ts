// GERADO por scripts/sync-origem.mjs — não edite aqui.
// A fonte é o repositório "origem", ao lado deste projeto. Edite lá, rode os
// testes de lá, e sincronize com: node scripts/sync-origem.mjs
export type {
  Channel,
  Touch,
  Attribution,
  AttributionEvent,
  AdSpend,
  CaptureOptions,
  CampaignLink,
} from "./types";

export { classify, deveSubstituirUltimoToque } from "./classify";
export type { ClassifyInput } from "./classify";

export {
  serializarToque,
  desserializarToque,
  lerCookie,
  nomesDeCookie,
} from "./cookies";

export { lerOrigem, paraColunas } from "./read";

export { montarRelatorio, faltamParaDecidir } from "./report";
export type { LinhaRelatorio, OpcoesRelatorio, SujeitoAtribuido } from "./report";

// A captura fica fora daqui: ela toca `document` e `window`, e importá-la num
// arquivo de servidor quebraria a renderização. Use `origem/browser`.
