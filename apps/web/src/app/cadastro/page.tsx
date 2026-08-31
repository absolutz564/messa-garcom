'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { LoginResponse } from '@messa/contracts';
import { api, setSession } from '@/lib/api';
import { errorMessage } from '@/lib/use-api';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

/** RF-06/BR-21 — cadastro self-service. Sucesso já vem logado (ADR-007): vai direto pro /admin. */
export default function CadastroPage() {
  const router = useRouter();
  const [form, setForm] = useState({ restaurantName: '', adminName: '', email: '', password: '' });
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api<LoginResponse>('/auth/signup', { method: 'POST', body: { ...form, acceptedPrivacy } }, false);
      setSession(session);
      router.replace('/admin');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-bold">
            Messa
          </Link>
          <Link href="/staff/login" className="text-sm text-neutral-600 hover:text-neutral-900">
            Já tenho conta
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-bold">Criar conta do restaurante</h1>
        <p className="mt-1 text-sm text-neutral-600">14 dias grátis, sem cartão. Você já sai com o painel pronto para cadastrar o cardápio e as mesas.</p>

        <Card className="mt-6">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nome do restaurante" hint="É o nome que aparece no cardápio e nos cartazes das mesas.">
              <Input required minLength={2} maxLength={80} value={form.restaurantName} onChange={(e) => setForm({ ...form, restaurantName: e.target.value })} />
            </Field>
            <Field label="Seu nome">
              <Input required minLength={2} maxLength={80} value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
            </Field>
            <Field label="Seu e-mail" hint="É com ele que você entra no painel.">
              <Input type="email" required maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Senha" hint="Mínimo de 8 caracteres.">
              <Input type="password" required minLength={8} maxLength={128} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>

            <label className="flex items-start gap-2 text-sm text-neutral-700">
              <input type="checkbox" required checked={acceptedPrivacy} onChange={(e) => setAcceptedPrivacy(e.target.checked)} className="mt-1" />
              <span>
                Li e aceito a{' '}
                <Link href="/privacidade" target="_blank" className="font-medium text-rose-700 underline">
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>

            <ErrorText>{error}</ErrorText>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Criando...' : 'Criar conta grátis'}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-neutral-500">
          Já tem conta?{' '}
          <Link href="/staff/login" className="font-medium text-neutral-800 underline">
            Entrar
          </Link>
        </p>
      </main>
    </div>
  );
}
