// GERADO por scripts/sync-origem.mjs — não edite aqui.
// A fonte é o repositório "origem", ao lado deste projeto. Edite lá, rode os
// testes de lá, e sincronize com: node scripts/sync-origem.mjs
/**
 * Canal de aquisição.
 *
 * A lista é curta de propósito. Canal serve para decidir onde colocar verba, e
 * essa decisão não fica melhor com trinta categorias — fica pior, porque cada
 * uma recebe poucos dados e nenhuma alcança significância. Detalhe fino vive em
 * `source` e `campaign`; canal é o nível em que a verba de fato se move.
 */
export type Channel =
  | "paid_search"
  | "paid_social"
  | "organic_search"
  | "organic_social"
  | "referral"
  | "email"
  | "direct"
  | "other";

/** Um contato do visitante com o produto, já classificado. */
export interface Touch {
  channel: Channel;
  /** Origem específica: "google", "instagram", "indicacao-crefito". */
  source: string | null;
  /** Meio declarado na URL (`utm_medium`), preservado como veio. */
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  /**
   * Identificador de clique da plataforma (gclid, fbclid, ttclid...). Guardado
   * porque é o que permite conciliar com o relatório da plataforma quando os
   * números divergem — e eles sempre divergem.
   */
  clickId: string | null;
  clickIdKind: string | null;
  /**
   * Caminho de entrada, **sem query string**. A query pode carregar dado
   * pessoal (e-mail em link de convite, token), e isto aqui vira dado
   * persistido e associado a uma pessoa.
   */
  landingPath: string | null;
  /** Apenas o host de quem indicou — URL inteira traz PII sem necessidade. */
  referrerHost: string | null;
  /** Milissegundos desde a época, para caber compacto no cookie. */
  at: number;
}

/**
 * O que se sabe sobre a origem de uma pessoa.
 *
 * Dois toques, e não um, porque as duas perguntas são diferentes e ambas
 * importam: **primeiro** responde "quem me apresentou a esse cliente" (o canal
 * que gera descoberta, normalmente conteúdo e social); **último** responde "o
 * que o fez decidir agora" (normalmente busca e remarketing). Guardar só um
 * leva a cortar verba do canal que enche o topo do funil, porque ele quase
 * nunca aparece no clique final.
 */
export interface Attribution {
  first: Touch;
  last: Touch;
}

export interface AttributionEvent {
  subjectType: string;
  subjectId: string;
  name: string;
  value?: number | null;
  currency?: string | null;
  occurredAt: Date;
}

export interface AdSpend {
  channel: Channel;
  source: string;
  campaign: string | null;
  /**
   * Peça específica, quando o gasto foi lançado por criativo e não por campanha.
   *
   * Opcional porque lançar um valor por campanha já responde a pergunta mais
   * importante. Detalhar por peça só compensa quando há mais de uma rodando ao
   * mesmo tempo — e aí o número vem pronto do gerenciador de anúncios.
   */
  content?: string | null;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  currency: string;
}

/**
 * Um link de anúncio já criado.
 *
 * Guardar isto não é conveniência de interface: é o que impede o erro de
 * digitação que quebra o relatório. O gasto precisa ser lançado com a mesma
 * origem e campanha que o link gravou, e entre criar o anúncio e lançar o gasto
 * passam semanas. Sem uma lista para escolher, o nome é digitado de memória — e
 * "tempo-de-documentacao" vira "tempo-documentacao" numa das duas pontas,
 * separando a verba dos clientes que ela trouxe.
 */
export interface CampaignLink {
  channel: Channel;
  source: string;
  campaign: string;
  content: string | null;
  url: string;
  createdAt: Date;
}

export interface CaptureOptions {
  /**
   * Hosts que contam como "eu mesmo". Visita vinda deles não é indicação e não
   * pode sobrescrever a origem — é só a pessoa navegando dentro do site.
   */
  internalHosts?: string[];
  /** Dias que o primeiro toque sobrevive. Padrão 180. */
  firstTouchDays?: number;
  /** Dias que o último toque sobrevive. Padrão 90. */
  lastTouchDays?: number;
  /** Prefixo dos cookies. Padrão "og". */
  cookiePrefix?: string;
}
