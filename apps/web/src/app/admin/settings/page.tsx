'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { TenantBranding } from '@messa/contracts';
import { api } from '@/lib/api';
import { errorMessage, useApi } from '@/lib/use-api';
import { hexToRgbTriplet } from '@/lib/format';
import { Button, Card, ErrorText, Field, Input, PageTitle } from '@/components/ui';
import { ImageUpload } from '@/components/image-upload';

export default function SettingsPage() {
  const tenant = useApi<TenantBranding>('/admin/tenant');
  const [form, setForm] = useState({ name: '', primaryColor: '#e11d48', logoUrl: null as string | null });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (tenant.data) setForm({ name: tenant.data.name, primaryColor: tenant.data.primaryColor, logoUrl: tenant.data.logoUrl });
  }, [tenant.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const t = await api<TenantBranding>('/admin/tenant', { method: 'PATCH', body: form });
      tenant.setData(t);
      document.documentElement.style.setProperty('--brand', hexToRgbTriplet(t.primaryColor));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageTitle>Restaurante</PageTitle>
      <Card className="max-w-lg">
        <form onSubmit={save} className="space-y-4">
          <Field label="Nome do restaurante">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Cor principal" hint="Usada nos botões e destaques do cardápio">
            <div className="flex items-center gap-3">
              <input type="color" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="h-10 w-14 cursor-pointer rounded border border-neutral-300" />
              <Input value={form.primaryColor} pattern="#[0-9a-fA-F]{6}" onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} />
            </div>
          </Field>
          <Field label="Logo">
            <ImageUpload value={form.logoUrl} onChange={(url) => setForm({ ...form, logoUrl: url })} />
          </Field>
          <ErrorText>{error}</ErrorText>
          {saved && <p className="text-sm text-green-700">Salvo.</p>}
          <Button type="submit">Salvar</Button>
        </form>
      </Card>
    </>
  );
}
