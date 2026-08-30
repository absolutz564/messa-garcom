'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Volta à página anterior quando existe histórico (ex.: cardápio da mesa); senão vai para a home. */
export function BackLink({ label = '← Voltar' }: { label?: string }) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    try {
      setCanGoBack(window.history.length > 1 && document.referrer.startsWith(window.location.origin));
    } catch {
      setCanGoBack(false);
    }
  }, []);
  return (
    <button
      type="button"
      onClick={() => (canGoBack ? router.back() : router.push('/'))}
      className="mb-4 inline-flex items-center rounded-lg px-2 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
    >
      {label}
    </button>
  );
}
