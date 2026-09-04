import { NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Nunca cachear: o código pode ser reaproveitado para outra campanha. */
export const dynamic = 'force-dynamic';

/**
 * Link curto de divulgação (RF-07/BR-23): `/i/<codigo>` leva à URL marcada da campanha.
 *
 * Existe porque um link com `utm_source` e `utm_campaign` à mostra anuncia que é
 * campanha, e quem recebe de um fornecedor ou de um dono de bar conhecido perde a
 * impressão de recomendação pessoal. Servido pelo **nosso domínio** de propósito:
 * encurtador de terceiro esconde o destino, e quem já desconfia de link de campanha
 * desconfia mais de link que não mostra para onde vai.
 *
 * **A marcação continua na URL de destino.** O redirecionamento não substitui a
 * atribuição: ele entrega o navegador na página com os parâmetros, e é ali que o
 * `OrigemTracker` grava o primeiro toque no cookie. Trocar isto por um redirect
 * "limpo" apagaria silenciosamente de onde o restaurante veio.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const landing = new URL('/', request.url);

  let destino: string | null = null;
  try {
    const res = await fetch(`${API}/public/links/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (res.ok) destino = ((await res.json()) as { url: string | null }).url;
  } catch {
    // API fora do ar não pode virar página de erro na cara de quem clicou num
    // anúncio. Perde-se a marcação; a visita, não.
  }

  if (!destino) {
    console.warn(`[link-curto] código sem destino: ${slug}`);
    return NextResponse.redirect(landing, 307);
  }

  // 307 e não 308: um código pode ser reaproveitado para outra campanha, e
  // redirecionamento permanente fica gravado no navegador de quem já clicou —
  // essa pessoa continuaria caindo na campanha antiga para sempre.
  return NextResponse.redirect(destino, 307);
}
