'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { LoginResponse, Role } from '@messa/contracts';
import { getSession, logout, refreshSession } from '@/lib/api';
import { hexToRgbTriplet } from '@/lib/format';
import { Button } from './ui';
import { DialogProvider } from './dialog';
import { BillingBanner } from './billing-banner';
import { InstallApp } from './install-app';

interface NavItem {
  href: string;
  label: string;
}

/**
 * Guarda de rota + navegação para as superfícies de staff.
 * `require`: papéis aceitos (admin herda). `platform`: exige super admin.
 */
export function StaffShell({
  children,
  nav,
  require,
  platform,
  title,
}: {
  children: ReactNode;
  nav: NavItem[];
  require?: Role[];
  platform?: boolean;
  title: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSessionState] = useState<LoginResponse | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setSessionState(getSession());
    sync();
    window.addEventListener('messa:session', sync);
    if (!getSession()) void refreshSession().then(sync);
    return () => window.removeEventListener('messa:session', sync);
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.replace(`/staff/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (platform && !session.isPlatformAdmin) router.replace('/staff/login');
    if (platform && session.isPlatformAdmin && !session.mfa) router.replace('/staff/2fa');
    const role = session.activeTenant?.role;
    if (require && (!role || (role !== 'admin' && !require.includes(role)))) router.replace('/staff');
  }, [session, platform, require, router, pathname]);

  if (!session) return <main className="p-6 text-sm text-neutral-500">Carregando…</main>;

  const brand = session.activeTenant ? undefined : '225 29 72';
  return (
    <DialogProvider>
    <div className="min-h-screen bg-neutral-50" style={brand ? ({ '--brand': brand } as React.CSSProperties) : undefined}>
      <BrandVar />
      {/*
        No celular vira duas faixas: identificação em cima, navegação embaixo rolando
        na horizontal. Numa fileira só, o título quebrava em duas linhas e as abas
        seguintes ficavam fora da tela — o garçom nem sabia que existiam.
      */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-semibold">{title}</span>
            <div className="flex shrink-0 items-center gap-2 text-sm text-neutral-600">
              <span className="hidden max-w-[220px] truncate sm:inline">
                {session.user.name}
                {session.activeTenant && <span className="text-neutral-400"> · {session.activeTenant.tenantName}</span>}
              </span>
              {/* No celular sobra só o restaurante: saber em qual casa se está logado importa mais que o próprio nome. */}
              <span className="max-w-[120px] truncate text-neutral-400 sm:hidden">{session.activeTenant?.tenantName}</span>
              <Button
                variant="ghost"
                onClick={async () => {
                  await logout();
                  router.replace('/staff/login');
                }}
              >
                Sair
              </Button>
            </div>
          </div>
          <nav className="-mx-1 mt-1 flex gap-1 overflow-x-auto pb-1 sm:mt-2">
            {[...nav, ...(session.activeTenant?.role === 'admin' && !nav.some((n) => n.href.startsWith('/admin')) ? [{ href: '/admin', label: 'Administração' }] : [])].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${(item.href === '/staff' ? pathname === '/staff' || pathname.startsWith('/staff/order') : pathname.startsWith(item.href)) ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {session.activeTenant && <BillingBanner session={session} />}
      <InstallApp />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
    </DialogProvider>
  );
}

/** Aplica a cor primária do tenant na CSS var --brand (RF-14). */
function BrandVar() {
  useEffect(() => {
    let cancelled = false;
    import('@/lib/api').then(({ api }) =>
      api<{ primaryColor: string }>('/admin/tenant')
        .then((t) => {
          if (!cancelled) document.documentElement.style.setProperty('--brand', hexToRgbTriplet(t.primaryColor));
        })
        .catch(() => undefined),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
