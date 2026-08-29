import { NextResponse, type NextRequest } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const apiOrigin = new URL(API).origin;
const wsOrigin = apiOrigin.replace(/^http/, 'ws');
const isProd = process.env.NODE_ENV === 'production';

/**
 * CSP com nonce por requisição (05-security/threat-model.md): scripts inline do Next só rodam com o nonce,
 * então injeção de HTML não consegue executar script. O Next lê `x-nonce` e o aplica aos seus scripts.
 */
export function middleware(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${apiOrigin}`,
    `connect-src 'self' ${apiOrigin} ${wsOrigin}`,
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
  ].join('; ');

  // O Next extrai o nonce do header CSP da REQUISIÇÃO para carimbar seus <script>; a resposta leva o mesmo CSP.
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: [{ source: '/((?!_next/static|_next/image|icon.svg|manifest.webmanifest).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }] }],
};
