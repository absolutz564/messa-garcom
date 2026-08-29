'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/use-api';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

function AcceptForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('As senhas não conferem');
    setBusy(true);
    setError(null);
    try {
      await api('/auth/accept-invite', { method: 'POST', body: { token, password } });
      router.replace('/staff/login');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <ErrorText>Link de convite inválido.</ErrorText>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Crie sua senha" hint="Mínimo 8 caracteres">
        <Input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirme a senha">
        <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy}>
        Ativar acesso
      </Button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Messa</h1>
        <p className="text-sm text-neutral-500">Você foi convidado para a equipe</p>
      </div>
      <Card>
        <Suspense>
          <AcceptForm />
        </Suspense>
      </Card>
    </main>
  );
}
