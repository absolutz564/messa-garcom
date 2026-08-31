'use client';

import type { ReactNode } from 'react';
import { StaffShell } from '@/components/staff-shell';

const NAV = [
  { href: '/staff', label: 'Atendimento' },
  { href: '/admin/menu', label: 'Cardápio' },
  { href: '/admin/tables', label: 'Mesas' },
  { href: '/admin/team', label: 'Equipe' },
  { href: '/admin/settings', label: 'Restaurante' },
  { href: '/admin/assinatura', label: 'Assinatura' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <StaffShell title="Messa · Administração" nav={NAV} require={['admin']}>
      {children}
    </StaffShell>
  );
}
