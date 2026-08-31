'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/use-api';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

/** BR-22 — pede o link de redefinição. A resposta é sempre a mesma, exista ou não a conta. */
export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } }, false);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Recuperar senha</h1>
        <p className="mt-1 text-sm text-neutral-500">Enviamos um link para você definir uma nova senha.</p>
      </div>

      <Card>
        {sent ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-lg bg-green-50 px-3 py-2 text-green-800">
              Se existir uma conta com <strong>{email}</strong>, o link de redefinição já está a caminho.
            </p>
            <p className="text-neutral-600">O link vale por 1 hora. Confira também a caixa de spam.</p>
            <Link href="/staff/login" className="block text-center font-medium text-neutral-800 underline">
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="E-mail" hint="O mesmo que você usa para entrar no painel.">
              <Input type="email" required autoFocus maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Enviando...' : 'Enviar link de redefinição'}
            </Button>
            <Link href="/staff/login" className="block text-center text-sm text-neutral-600 underline">
              Voltar para o login
            </Link>
          </form>
        )}
      </Card>
    </main>
  );
}
