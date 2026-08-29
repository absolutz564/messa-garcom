const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function money(cents: number): string {
  return brl.format(cents / 100);
}

/** "29,90" → 2990. Aceita ponto ou vírgula. */
export function parseMoney(input: string): number | null {
  const normalized = input.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** #RRGGBB → "r g b" para a CSS var --brand. */
export function hexToRgbTriplet(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '225 29 72';
  return `${parseInt(m[1]!, 16)} ${parseInt(m[2]!, 16)} ${parseInt(m[3]!, 16)}`;
}
