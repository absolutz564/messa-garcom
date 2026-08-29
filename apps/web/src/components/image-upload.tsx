'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/use-api';
import { Button, ErrorText } from './ui';

/** Envia para POST /admin/uploads e devolve a URL pública. */
export function ImageUpload({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { url } = await api<{ url: string }>('/admin/uploads', { method: 'POST', body: fd });
      onChange(url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-16 w-16 rounded-lg border border-neutral-200 object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-400">sem foto</div>
        )}
        <label className="cursor-pointer">
          <span className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-100">
            {busy ? 'Enviando…' : 'Escolher imagem'}
          </span>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {value && (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            Remover
          </Button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
