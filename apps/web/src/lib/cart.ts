'use client';

import { useCallback, useEffect, useState } from 'react';

export interface CartLine {
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
  notes: string;
}

/** Carrinho por dispositivo (RF-60), persistido no navegador por token de mesa. */
export function useCart(storageKey: string) {
  const [lines, setLines] = useState<CartLine[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setLines(JSON.parse(raw) as CartLine[]);
    } catch {
      /* ignore */
    }
  }, [storageKey]);
  const persist = useCallback(
    (next: CartLine[]) => {
      setLines(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );
  const add = (p: { id: string; name: string; priceCents: number }) =>
    persist(lines.some((l) => l.productId === p.id) ? lines.map((l) => (l.productId === p.id ? { ...l, quantity: Math.min(50, l.quantity + 1) } : l)) : [...lines, { productId: p.id, name: p.name, priceCents: p.priceCents, quantity: 1, notes: '' }]);
  const remove = (productId: string) => persist(lines.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity - 1 } : l)).filter((l) => l.quantity > 0));
  const setNotes = (productId: string, notes: string) => persist(lines.map((l) => (l.productId === productId ? { ...l, notes } : l)));
  const clear = () => persist([]);
  const qty = (productId: string) => lines.find((l) => l.productId === productId)?.quantity ?? 0;
  const totalCents = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  return { lines, add, remove, setNotes, clear, qty, totalCents, count };
}

export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
