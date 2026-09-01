// GERADO por scripts/sync-origem.mjs — não edite aqui.
// A fonte é o repositório "origem", ao lado deste projeto. Edite lá, rode os
// testes de lá, e sincronize com: node scripts/sync-origem.mjs
import type { Channel, Touch } from "./types";

/**
 * Identificadores de clique, por plataforma.
 *
 * `fbclid` está de fora **de propósito** — ver a nota em `classify`.
 */
const CLICK_IDS: Array<{ param: string; source: string; channel: Channel }> = [
  { param: "gclid", source: "google", channel: "paid_search" },
  // gbraid/wbraid substituem o gclid quando o iOS bloqueia o identificador
  // pessoal. Quem só procura gclid perde a maior parte do tráfego de iPhone.
  { param: "gbraid", source: "google", channel: "paid_search" },
  { param: "wbraid", source: "google", channel: "paid_search" },
  { param: "msclkid", source: "bing", channel: "paid_search" },
  { param: "ttclid", source: "tiktok", channel: "paid_social" },
  { param: "li_fat_id", source: "linkedin", channel: "paid_social" },
  { param: "twclid", source: "twitter", channel: "paid_social" },
  { param: "epik", source: "pinterest", channel: "paid_social" },
];

/** `utm_medium` → canal. Chaves em minúsculas, sem pontuação. */
const MEDIUM_TO_CHANNEL: Record<string, Channel> = {
  cpc: "paid_search",
  ppc: "paid_search",
  paidsearch: "paid_search",
  sem: "paid_search",
  adwords: "paid_search",
  paidsocial: "paid_social",
  socialpaid: "paid_social",
  cpm: "paid_social",
  display: "paid_social",
  banner: "paid_social",
  social: "organic_social",
  socialorganic: "organic_social",
  organic: "organic_search",
  email: "email",
  newsletter: "email",
  referral: "referral",
  affiliate: "referral",
  parceria: "referral",
};

const BUSCADORES = [
  "google.",
  "bing.com",
  "duckduckgo.com",
  "search.yahoo",
  "ecosia.org",
  "search.brave.com",
  "yandex.",
];

const REDES = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "linkedin.com",
  "lnkd.in",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "t.co",
  "pinterest.",
  "reddit.com",
  "wa.me",
  "whatsapp.com",
  "t.me",
  "telegram.me",
];

function normalizar(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpo = valor.trim().slice(0, 200);
  return limpo.length > 0 ? limpo : null;
}

function chaveDeMedium(medium: string | null): string | null {
  if (!medium) return null;
  return medium.toLowerCase().replace(/[^a-z]/g, "");
}

function hostDe(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function combina(host: string, lista: string[]): boolean {
  return lista.some((item) => host === item || host.endsWith(item) || host.includes(item));
}

export interface ClassifyInput {
  /** URL completa da página de entrada. */
  url: string;
  /** `document.referrer`, ou o cabeçalho Referer no servidor. */
  referrer?: string | null;
  /** Hosts próprios — visita vinda deles não é indicação. */
  internalHosts?: string[];
  /** Injetável para tornar o resultado determinístico em teste. */
  now?: number;
}

/**
 * Transforma uma chegada em um toque classificado, ou `null` quando não há
 * nada a registrar.
 *
 * Devolve `null` em navegação interna: sem isso, cada clique dentro do site
 * viraria um "novo toque" e apagaria a campanha que trouxe a pessoa. É o erro
 * mais comum em atribuição feita à mão, e o mais caro — some justamente com o
 * dado que você pagou para obter.
 */
export function classify(input: ClassifyInput): Touch | null {
  const { url, referrer, internalHosts = [], now = Date.now() } = input;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const proprios = [parsed.hostname.replace(/^www\./, "").toLowerCase(), ...internalHosts.map((h) => h.toLowerCase())];
  const params = parsed.searchParams;
  const referrerHost = hostDe(referrer);
  const referrerExterno = referrerHost && !proprios.includes(referrerHost) ? referrerHost : null;

  const utmSource = normalizar(params.get("utm_source"));
  const utmMedium = normalizar(params.get("utm_medium"));
  const utmCampaign = normalizar(params.get("utm_campaign"));
  const utmContent = normalizar(params.get("utm_content"));
  const utmTerm = normalizar(params.get("utm_term"));

  let clickId: string | null = null;
  let clickIdKind: string | null = null;
  let clickChannel: Channel | null = null;
  let clickSource: string | null = null;

  for (const { param, source, channel } of CLICK_IDS) {
    const valor = normalizar(params.get(param));
    if (valor) {
      clickId = valor;
      clickIdKind = param;
      clickChannel = channel;
      clickSource = source;
      break;
    }
  }

  /*
   * fbclid é tratado à parte porque **não significa anúncio**.
   *
   * O Facebook e o Instagram acrescentam fbclid a qualquer link clicado dentro
   * deles, inclusive num post orgânico ou numa mensagem que alguém mandou. Tomar
   * fbclid por tráfego pago infla o resultado da Meta com visitas que não
   * custaram nada, e o custo por cliente calculado em cima disso fica menor que
   * o real — levando a aumentar verba num canal que parece melhor do que é.
   *
   * Só vira pago quando a URL também declara `utm_medium` de anúncio, o que só
   * acontece se você marcou o link ao criar a campanha.
   */
  const fbclid = normalizar(params.get("fbclid"));
  if (!clickId && fbclid) {
    clickId = fbclid;
    clickIdKind = "fbclid";
    clickSource = utmSource ?? (referrerExterno?.includes("instagram") ? "instagram" : "facebook");
    clickChannel = null; // decidido abaixo, pelo utm_medium
  }

  const mediumChannel = MEDIUM_TO_CHANNEL[chaveDeMedium(utmMedium) ?? ""] ?? null;

  let channel: Channel;
  let source: string | null;

  if (mediumChannel) {
    // A marcação explícita ganha: foi você que a escreveu ao criar a campanha.
    channel = mediumChannel;
    source = utmSource ?? clickSource ?? referrerExterno;
  } else if (clickChannel) {
    channel = clickChannel;
    source = utmSource ?? clickSource;
  } else if (fbclid) {
    // fbclid sem utm de anúncio: compartilhamento orgânico dentro da Meta.
    channel = "organic_social";
    source = clickSource;
  } else if (utmSource) {
    // Marcou origem mas não meio — dá para saber de onde veio, não como.
    channel = "other";
    source = utmSource;
  } else if (referrerExterno) {
    if (combina(referrerExterno, BUSCADORES)) {
      channel = "organic_search";
      source = referrerExterno.split(".")[0] ?? referrerExterno;
    } else if (combina(referrerExterno, REDES)) {
      channel = "organic_social";
      source = referrerExterno;
    } else {
      channel = "referral";
      source = referrerExterno;
    }
  } else {
    channel = "direct";
    source = null;
  }

  return {
    channel,
    source,
    medium: utmMedium,
    campaign: utmCampaign,
    content: utmContent,
    term: utmTerm,
    clickId,
    clickIdKind,
    landingPath: parsed.pathname || "/",
    referrerHost: referrerExterno,
    at: now,
  };
}

/**
 * Decide se um toque novo substitui o último toque conhecido.
 *
 * Visita direta **não** substitui campanha anterior. Quem viu o anúncio na
 * terça e digitou o endereço na quinta foi trazido pelo anúncio; registrar
 * "direto" apagaria exatamente o que se está tentando medir. É o mesmo critério
 * do "último clique não-direto" que as ferramentas de analytics usam, e existe
 * porque a alternativa credita ao acaso o trabalho do canal pago.
 */
export function deveSubstituirUltimoToque(atual: Touch | null, novo: Touch): boolean {
  if (!atual) return novo.channel !== "direct";
  if (novo.channel === "direct") return false;
  return true;
}
