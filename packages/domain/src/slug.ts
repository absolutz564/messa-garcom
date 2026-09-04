/**
 * BR-21 — slug do tenant gerado a partir do nome do restaurante, nunca pedido no
 * cadastro self-service. `tenants.slug` é hoje só exibição/unicidade (não aparece em
 * URL pública), então não há requisito de legibilidade além de "razoável".
 */
export function slugify(input: string): string {
  const withoutAccents = input.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const base = withoutAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return base || 'restaurante';
}

/** Sufixo curto para resolver colisão de slug sem nova rodada de input do usuário. */
export function slugWithSuffix(base: string, randomInt: (maxExclusive: number) => number): string {
  return `${base}-${randomInt(9000) + 1000}`;
}

/** Tamanho do código curto: cabe em cartão, bio e mensagem sem quebrar linha. */
const SHORT_CODE_MAX = 24;

/**
 * BR-23 — código do link curto servido em `/i/<codigo>`.
 *
 * Nasce da **origem** (o parceiro, o perfil, o veículo), não da campanha: quem
 * administra reconhece `/i/instagram` de relance, e quem clica não lê nada além
 * de um caminho curto. Derivar da campanha faria o oposto — anunciaria na barra
 * de endereço o ângulo que está sendo testado.
 *
 * `tentativa` resolve colisão por sufixo numérico. **Nunca reaproveitar o código
 * de outro link**: dois links com o mesmo código creditariam a campanha de um à
 * outra, e o relatório passaria a mentir a favor de quem chegou depois.
 */
export function campaignShortCode(source: string, tentativa = 0): string {
  // Normalização própria, e não `slugify`: aquela existe para nome de restaurante
  // e cai em "restaurante" quando não sobra nada — nome errado para um código de
  // link, e que ainda colidiria com todo source impronunciável.
  const base =
    source
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'link';

  const sufixo = tentativa === 0 ? '' : `-${tentativa + 1}`;
  return `${base.slice(0, SHORT_CODE_MAX - sufixo.length).replace(/-+$/, '')}${sufixo}`;
}
