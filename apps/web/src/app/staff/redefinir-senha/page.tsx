'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/use-api';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

/** BR-22 — consome o token do e-mail e define a nova senha. */
function RedefinirSenhaForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } }, false);
      setDone(true);
      setTimeout(() => router.replace('/staff/login'), 2500);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Card>
        <p className="text-sm text-neutral-700">Link inválido — falta o código de redefinição.</p>
        <Link href="/staff/recuperar-senha" className="mt-3 block text-sm font-medium text-neutral-900 underline">
          Pedir um novo link
        </Link>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Senha alterada. Redirecionando para o login...</p>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
          <Input type="password" required autoFocus minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Repita a nova senha">
          <Input type="password" required minLength={8} maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Salvando...' : 'Salvar nova senha'}
        </Button>
        <p className="text-center text-xs text-neutral-500">Por segurança, todos os dispositivos conectados serão desconectados.</p>
      </form>
    </Card>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Nova senha</h1>
        <p className="mt-1 text-sm text-neutral-500">Escolha a senha que você vai usar para entrar.</p>
      </div>
      <Suspense fallback={<Card>Carregando…</Card>}>
        <RedefinirSenhaForm />
      </Suspense>
    </main>
  );
}
