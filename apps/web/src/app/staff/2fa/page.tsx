'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { LoginResponse, TotpSetupResponse } from '@messa/contracts';
import { api, getSession, homeFor, setSession } from '@/lib/api';
import { errorMessage } from '@/lib/use-api';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

/** Configuração do 2FA (TOTP). Obrigatória para o super admin antes de acessar /platform. */
export default function TwoFactorPage() {
  const router = useRouter();
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getSession()) {
      router.replace('/staff/login?next=/staff/2fa');
      return;
    }
    api<TotpSetupResponse>('/auth/2fa/setup', { method: 'POST' })
      .then(setSetup)
      .catch((e) => setError(errorMessage(e)));
  }, [router]);

  async function enable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api<LoginResponse>('/auth/2fa/enable', { method: 'POST', body: { code } });
      setSession(session);
      router.replace(homeFor(session));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Verificação em duas etapas</h1>
        <p className="text-sm text-neutral-500">Obrigatória para administradores da plataforma.</p>
      </div>
      <Card>
        <ErrorText>{error}</ErrorText>
        {setup ? (
          <form onSubmit={enable} className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700">
              <li>Instale um app autenticador (Google Authenticator, Authy, 1Password…).</li>
              <li>Escaneie o QR Code abaixo ou digite a chave manualmente.</li>
              <li>Informe o código de 6 dígitos gerado pelo app.</li>
            </ol>
            <div className="mx-auto w-48 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
            <p className="break-all text-center font-mono text-xs text-neutral-500 select-all">{setup.secret}</p>
            <Field label="Código do aplicativo">
              <Input inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </Field>
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
              Ativar
            </Button>
          </form>
        ) : (
          !error && <p className="text-sm text-neutral-500">Gerando chave…</p>
        )}
      </Card>
    </main>
  );
}
