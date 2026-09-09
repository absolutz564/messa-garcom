'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AffiliateBlock, AffiliateSituation } from '@messa/contracts';
import { API_URL } from '@/lib/api';
import { Badge, Button, Card, ErrorText, Field, Input } from '@/components/ui';

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

const SITUACAO: Record<AffiliateSituation, { rotulo: string; tom: 'neutral' | 'green' | 'red' | 'amber' }> = {
  em_teste: { rotulo: 'Em teste', tom: 'neutral' },
  teste_vencido: { rotulo: 'Teste vencido', tom: 'red' },
  pagante: { rotulo: 'Pagante', tom: 'green' },
  vencida: { rotulo: 'Assinatura vencida', tom: 'amber' },
};

/**
 * Área de acompanhamento para quem divulga (RF-08/BR-24).
 *
 * Mostra quantos restaurantes vieram de cada código de divulgação e em que pé
 * cada um está — **sem nome, e-mail ou faturamento**. Quem divulga é terceiro em
 * relação ao restaurante: precisa conferir a própria contagem, não saber quem
 * são os clientes.
 *
 * Autenticação própria, separada da de staff. Quem tem esta senha não alcança
 * nenhuma tela com mesa, pedido ou cobrança.
 */
export default function AfiliadosPage() {
  const [blocos, setBlocos] = useState<AffiliateBlock[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  /*
   * Sem sessão a rota responde 404 de propósito, então "não autenticado" chega
   * aqui como ausência de dados e não como erro — a tela de entrada aparece,
   * sem mensagem vermelha para quem só abriu o endereço.
   */
  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/afiliados/painel`, { credentials: 'include', cache: 'no-store' });
      setBlocos(res.ok ? ((await res.json()) as AffiliateBlock[]) : null);
    } catch {
      setBlocos(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setErro(null);
    try {
      const res = await fetch(`${API_URL}/afiliados/entrar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
      });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(corpo?.message ?? 'Não foi possível entrar.');
      }
      setSenha('');
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setEntrando(false);
    }
  }

  async function sair() {
    await fetch(`${API_URL}/afiliados/sair`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
    setBlocos(null);
  }

  if (carregando) return <main className="p-6 text-sm text-neutral-500">Carregando…</main>;

  if (!blocos) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <Card className="w-full max-w-sm">
          <p className="text-lg font-bold">Messa</p>
          <h1 className="mt-3 text-xl font-semibold">Acompanhamento de divulgação</h1>
          <p className="mt-1 text-sm text-neutral-600">Veja quantos restaurantes vieram do seu link e em que situação estão.</p>
          <form onSubmit={entrar} className="mt-4 space-y-3">
            <Field label="Usuário">
              <Input autoComplete="username" required value={usuario} onChange={(e) => setUsuario(e.target.value)} />
            </Field>
            <Field label="Senha">
              <Input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
            </Field>
            <ErrorText>{erro}</ErrorText>
            <Button type="submit" className="w-full" disabled={entrando}>
              Entrar
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold">Messa</span>
          <Button variant="ghost" onClick={sair}>
            Sair
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-xl font-semibold">Acompanhamento de divulgação</h1>
        <p className="mt-1 text-sm text-neutral-600">Restaurantes que chegaram por link de divulgação. Procure o seu código na lista.</p>

        {blocos.length === 0 && (
          <Card className="mt-6 text-center">
            <p className="text-sm text-neutral-600">Nenhum cadastro veio de link de divulgação ainda.</p>
            <p className="mx-auto mt-2 max-w-sm text-xs text-neutral-500">
              Só conta quem chegou pelo link. Quem digitar o endereço do site direto não aparece aqui.
            </p>
          </Card>
        )}

        {blocos.map((b) => (
          <section key={b.codigo} className="mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                Código <span className="font-mono text-rose-700">{b.codigo}</span>
              </h2>
              <p className="text-sm text-neutral-600">
                {b.cadastros} cadastro{b.cadastros === 1 ? '' : 's'} · <strong className="text-neutral-900">{b.pagantes}</strong> pagante
                {b.pagantes === 1 ? '' : 's'}
              </p>
            </div>

            <ul className="mt-3 space-y-2">
              {b.indicacoes.map((i) => (
                <li key={i.referencia} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Cadastro em {dataCurta(i.cadastradaEm)}</p>
                    <p className="text-xs text-neutral-500">
                      ref. {i.referencia}
                      {i.pagouEm && ` · pagou em ${dataCurta(i.pagouEm)}`}
                    </p>
                  </div>
                  <Badge tone={SITUACAO[i.situacao].tom}>{SITUACAO[i.situacao].rotulo}</Badge>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="mt-8 text-xs leading-relaxed text-neutral-500">
          Por privacidade dos restaurantes, esta tela não mostra nome, e-mail nem valores. A referência serve para conferir um cadastro
          específico com a gente.
        </p>
      </div>
    </main>
  );
}
