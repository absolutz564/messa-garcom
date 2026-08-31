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
