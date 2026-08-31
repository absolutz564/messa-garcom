import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Messa — Garçom Virtual',
  description: 'Um garçom virtual que trabalha junto com a equipe do restaurante.',
  manifest: '/manifest.webmanifest',
  icons: {
    // O iOS ignora SVG na tela de início: o apple-touch-icon precisa ser PNG (PDR-019).
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: { capable: true, title: 'Messa', statusBarStyle: 'default' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, themeColor: '#e11d48' };

/** Render por requisição: necessário para o nonce da CSP (middleware) chegar aos scripts do Next. */
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
