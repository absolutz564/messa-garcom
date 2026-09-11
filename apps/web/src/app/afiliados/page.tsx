'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AffiliateBlock, AffiliateSituation } from '@messa/contracts';
import { API_URL } from '@/lib/api';
import { Badge, Button, Card, ErrorText, Field, Input } from '@/components/ui';

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/**
 * `fetch` só rejeita quando a requisição **não chegou a acontecer**: rede fora,
 * DNS, TLS, extensão bloqueando, rede de empresa barrando o subdomínio. O
 * navegador chama isso de "Failed to fetch" — texto que não diz nada a um
 * divulgador que só quer conferir os próprios cadastros, e que não distingue
 * "senha errada" de "não cheguei no servidor".
 */
function mensagemDeRede(): string {
  const host = (() => {
    try {
      return new URL(API_URL).host;
    } catch {
      return API_URL;
    }
  })();
  return `Não foi possível falar com o servidor (${host}). Abra https://${host}/ready no navegador: se essa página também não abrir, o bloqueio está na sua rede ou no seu navegador — tente outra rede, ou desative bloqueador de anúncios e VPN para este site.`;
}

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
      // Falha de rede aqui não pode virar tela de login silenciosa: quem acabou
      // de entrar com a senha certa acharia que a senha está errada.
      setBlocos(null);
      setErro(mensagemDeRede());
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

    let res: Response;
    try {
      res = await fetch(`${API_URL}/afiliados/entrar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
      });
    } catch {
      setErro(mensagemDeRede());
      setEntrando(false);
      return;
    }

    if (!res.ok) {
      const corpo = (await res.json().catch(() => null)) as { message?: string } | null;
      setErro(corpo?.message ?? 'Não foi possível entrar.');
      setEntrando(false);
      return;
    }

    setSenha('');
    setErro(null);
    await carregar();
    setEntrando(false);
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
                {b.visitas} clique{b.visitas === 1 ? '' : 's'} · {b.cadastros} cadastro{b.cadastros === 1 ? '' : 's'} ·{' '}
                <strong className="text-neutral-900">{b.pagantes}</strong> pagante{b.pagantes === 1 ? '' : 's'}
              </p>
            </div>

            {/*
              Zero cadastros com cliques e zero cadastros sem cliques são problemas
              opostos — distribuição fraca vs. página que não convence. Dizer qual
              é o caso é o motivo de a contagem existir.
            */}
            {b.cadastros === 0 && (
              <p className="mt-2 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
                {b.visitas === 0
                  ? 'Ninguém clicou neste link ainda.'
                  : `${b.visitas} pessoa${b.visitas === 1 ? '' : 's'} abriu o link e ainda não se cadastrou.`}
              </p>
            )}

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
          <strong>Clique</strong> é cada pessoa nova que abriu o seu link — quem navega pelo site ou volta depois não conta de novo, e quem digita
          o endereço direto não entra na conta de ninguém. Por privacidade dos restaurantes, esta tela não mostra nome, e-mail nem valores. A
          referência serve para conferir um cadastro específico com a gente.
        </p>
      </div>
    </main>
  );
}
