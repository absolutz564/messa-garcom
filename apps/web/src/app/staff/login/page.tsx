'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { ApiRequestError, homeFor, login } from '@/lib/api';
import { errorMessage } from '@/lib/use-api';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await login(email, password, undefined, needsTotp ? totpCode : undefined);
      // Super admin sem 2FA: configura antes de entrar na plataforma.
      if (session.isPlatformAdmin && !session.mfa && !session.activeTenant) return router.replace('/staff/2fa');
      router.replace(params.get('next') ?? homeFor(session));
    } catch (err) {
      if (err instanceof ApiRequestError && err.error.code === 'totp_required') {
        setNeedsTotp(true);
      } else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="E-mail">
        <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={needsTotp} />
      </Field>
      <Field label="Senha">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={needsTotp} />
      </Field>
      {needsTotp && (
        <Field label="Código do aplicativo autenticador">
          <Input inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" autoFocus required value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        </Field>
      )}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy || (needsTotp && totpCode.length !== 6)}>
        {busy ? 'Entrando…' : needsTotp ? 'Confirmar' : 'Entrar'}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Messa</h1>
        <p className="text-sm text-neutral-500">Acesso da equipe</p>
      </div>
      <Card>
        <Suspense>
          <LoginForm />
        </Suspense>
      </Card>
      <p className="text-center text-xs text-neutral-400">
        <Link href="/privacidade" className="underline">
          Política de privacidade
        </Link>
      </p>
    </main>
  );
}
