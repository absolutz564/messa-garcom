'use client';

import { useState, type FormEvent } from 'react';
import type { AcquisitionChannel, AcquisitionRow, CampaignLinkDto } from '@messa/contracts';
import { api } from '@/lib/api';
import { errorMessage, useApi } from '@/lib/use-api';
import { StaffShell } from '@/components/staff-shell';
import { Button, Card, ErrorText, Field, Input, PageTitle, Select } from '@/components/ui';

const CANAIS: { valor: AcquisitionChannel; rotulo: string }[] = [
  { valor: 'paid_social', rotulo: 'Social pago (Instagram, Meta)' },
  { valor: 'paid_search', rotulo: 'Busca paga (Google Ads)' },
  { valor: 'organic_social', rotulo: 'Social orgânico' },
  { valor: 'organic_search', rotulo: 'Busca orgânica' },
  { valor: 'referral', rotulo: 'Indicação' },
  { valor: 'email', rotulo: 'E-mail' },
  { valor: 'other', rotulo: 'Outro' },
];

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hoje = () => new Date().toISOString().slice(0, 10);

export default function AquisicaoPage() {
  const [modelo, setModelo] = useState<'first' | 'last'>('last');
  const [agruparPor, setAgruparPor] = useState<'channel' | 'source' | 'campaign' | 'content'>('campaign');
  const relatorio = useApi<AcquisitionRow[]>(`/platform/acquisition/report?modelo=${modelo}&agruparPor=${agruparPor}`);
  const links = useApi<CampaignLinkDto[]>('/platform/acquisition/links');
  const [error, setError] = useState<string | null>(null);

  const [gasto, setGasto] = useState({ channel: 'paid_social' as AcquisitionChannel, source: '', campaign: '', amount: '', periodStart: hoje(), periodEnd: hoje() });
  const [novoLink, setNovoLink] = useState({ channel: 'paid_social' as AcquisitionChannel, source: '', campaign: '', content: '' });
  const [ultimo, setUltimo] = useState<CampaignLinkDto | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function lancarGasto(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api('/platform/acquisition/spend', {
        method: 'POST',
        body: {
          channel: gasto.channel,
          source: gasto.source,
          campaign: gasto.campaign || null,
          amount: Number(gasto.amount.replace(',', '.')),
          periodStart: new Date(`${gasto.periodStart}T00:00:00`).toISOString(),
          periodEnd: new Date(`${gasto.periodEnd}T23:59:59`).toISOString(),
        },
      });
      setGasto({ ...gasto, source: '', campaign: '', amount: '' });
      await relatorio.reload();
    });
  }

  async function criarLink(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const salvo = await api<CampaignLinkDto>('/platform/acquisition/links', { method: 'POST', body: { ...novoLink, content: novoLink.content || null } });
      setUltimo(salvo);
      setNovoLink({ ...novoLink, source: '', campaign: '', content: '' });
      await links.reload();
    });
  }

  const total = (relatorio.data ?? []).reduce(
    (acc, l) => ({ cadastros: acc.cadastros + l.cadastros, pagantes: acc.pagantes + l.pagantes, gasto: acc.gasto + l.gasto, receita: acc.receita + l.receita }),
    { cadastros: 0, pagantes: 0, gasto: 0, receita: 0 },
  );

  return (
    <StaffShell title="Messa · Plataforma" platform nav={[{ href: '/platform', label: 'Restaurantes' }, { href: '/platform/aquisicao', label: 'Aquisição' }]}>
      <PageTitle>Aquisição</PageTitle>
      <ErrorText>{error ?? relatorio.error}</ErrorText>

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Crédito">
            <Select value={modelo} onChange={(e) => setModelo(e.target.value as 'first' | 'last')}>
              <option value="last">Último toque (quem fechou)</option>
              <option value="first">Primeiro toque (quem apresentou)</option>
            </Select>
          </Field>
          <Field label="Agrupar por">
            <Select value={agruparPor} onChange={(e) => setAgruparPor(e.target.value as typeof agruparPor)}>
              <option value="campaign">Campanha</option>
              <option value="channel">Canal</option>
              <option value="source">Origem</option>
              <option value="content">Peça (criativo)</option>
            </Select>
          </Field>
          <p className="text-xs text-neutral-500">
            &quot;Primeiro&quot; responde quem apresentou o produto; &quot;último&quot;, o que fez decidir agora. Olhar só um corta verba de quem enche o topo do funil.
          </p>
        </div>
      </Card>

      <Card className="mb-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="py-2">Origem</th>
              <th className="text-right">Cadastros</th>
              <th className="text-right">Ativados</th>
              <th className="text-right">Pagantes</th>
              <th className="text-right">Gasto</th>
              <th className="text-right">Receita</th>
              <th className="text-right">Custo/cliente</th>
              <th className="text-right">Retorno</th>
            </tr>
          </thead>
          <tbody>
            {relatorio.data?.map((l) => (
              <tr key={l.chave} className="border-t border-neutral-100">
                <td className="py-2 font-medium">{l.chave}</td>
                <td className="text-right">{l.cadastros}</td>
                <td className="text-right">{l.ativados}</td>
                <td className="text-right font-medium">{l.pagantes}</td>
                <td className="text-right">{brl(l.gasto)}</td>
                <td className="text-right">{brl(l.receita)}</td>
                <td className="text-right">{l.custoPorCliente === null ? <span className="text-neutral-400">—</span> : brl(l.custoPorCliente)}</td>
                <td className={`text-right ${l.retorno !== null && l.retorno < 1 ? 'text-red-700' : ''}`}>
                  {l.retorno === null ? <span className="text-neutral-400">—</span> : `${l.retorno.toFixed(2)}×`}
                </td>
              </tr>
            ))}
            {relatorio.data?.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-neutral-500">
                  Nenhum cadastro atribuído ainda. Os dados aparecem quando alguém se cadastrar vindo de um link.
                </td>
              </tr>
            )}
          </tbody>
          {(relatorio.data?.length ?? 0) > 0 && (
            <tfoot>
              <tr className="border-t-2 border-neutral-200 font-medium">
                <td className="py-2">Total</td>
                <td className="text-right">{total.cadastros}</td>
                <td />
                <td className="text-right">{total.pagantes}</td>
                <td className="text-right">{brl(total.gasto)}</td>
                <td className="text-right">{brl(total.receita)}</td>
                <td className="text-right">{total.pagantes > 0 ? brl(total.gasto / total.pagantes) : '—'}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-1 font-semibold">Lançar gasto de mídia</h2>
          <p className="mb-3 text-xs text-neutral-500">Use a mesma origem e campanha do link do anúncio — nome diferente separa a verba dos clientes que ela trouxe.</p>
          <form onSubmit={lancarGasto} className="space-y-3">
            <Field label="Canal">
              <Select value={gasto.channel} onChange={(e) => setGasto({ ...gasto, channel: e.target.value as AcquisitionChannel })}>
                {CANAIS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Origem" hint="instagram, google, indicacao-fornecedor…">
              <Input required maxLength={60} value={gasto.source} onChange={(e) => setGasto({ ...gasto, source: e.target.value })} />
            </Field>
            <Field label="Campanha (opcional)">
              <Input maxLength={80} value={gasto.campaign} onChange={(e) => setGasto({ ...gasto, campaign: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="De">
                <Input type="date" required value={gasto.periodStart} onChange={(e) => setGasto({ ...gasto, periodStart: e.target.value })} />
              </Field>
              <Field label="Até">
                <Input type="date" required value={gasto.periodEnd} onChange={(e) => setGasto({ ...gasto, periodEnd: e.target.value })} />
              </Field>
            </div>
            <Field label="Valor (R$)">
              <Input required inputMode="decimal" placeholder="500,00" value={gasto.amount} onChange={(e) => setGasto({ ...gasto, amount: e.target.value })} />
            </Field>
            <Button type="submit" className="w-full">
              Lançar gasto
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Gerar link de anúncio</h2>
          <p className="mb-3 text-xs text-neutral-500">
            Sempre use estes links nos anúncios: é o que faz o cadastro chegar com a origem marcada. O código curto (<span className="font-mono">/i/…</span>) leva ao link
            longo sem mostrar a campanha para quem clica.
          </p>
          <form onSubmit={criarLink} className="space-y-3">
            <Field label="Canal">
              <Select value={novoLink.channel} onChange={(e) => setNovoLink({ ...novoLink, channel: e.target.value as AcquisitionChannel })}>
                {CANAIS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Origem">
              <Input required maxLength={60} value={novoLink.source} onChange={(e) => setNovoLink({ ...novoLink, source: e.target.value })} />
            </Field>
            <Field label="Campanha">
              <Input required maxLength={80} value={novoLink.campaign} onChange={(e) => setNovoLink({ ...novoLink, campaign: e.target.value })} />
            </Field>
            <Field label="Peça / criativo (opcional)">
              <Input maxLength={80} value={novoLink.content} onChange={(e) => setNovoLink({ ...novoLink, content: e.target.value })} />
            </Field>
            <Button type="submit" variant="secondary" className="w-full">
              Gerar link
            </Button>
          </form>

          {ultimo && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Link para divulgar</p>
              <p className="mt-1 break-all font-mono text-sm font-semibold">{curto(ultimo) ?? ultimo.url}</p>
              <p className="mt-1 text-xs text-neutral-600">
                {curto(ultimo)
                  ? 'Compartilhe este, não o longo: ele não anuncia que é campanha na barra de endereço, e continua creditando a origem.'
                  : 'Sem código curto desta vez — o link longo funciona igual e continua marcado.'}
              </p>
              <p className="mt-2 text-xs text-neutral-600">
                Ao lançar o gasto, use <strong className="font-mono">{ultimo.source}</strong> como origem e <strong className="font-mono">{ultimo.campaign}</strong> como
                campanha. Nome diferente separa a verba dos clientes que ela trouxe.
              </p>
              <CopiarBotao texto={curto(ultimo) ?? ultimo.url} />
            </div>
          )}

          <ul className="mt-4 space-y-2">
            {links.data?.map((l) => (
              <li key={l.url} className="rounded-lg bg-neutral-50 p-2 text-xs">
                <p className="font-medium">
                  {l.source} · {l.campaign}
                  {l.content && ` · ${l.content}`}
                </p>
                {curto(l) ? (
                  <p className="mt-1 break-all font-mono font-semibold select-all">{curto(l)}</p>
                ) : (
                  <p className="mt-1 text-neutral-400">Sem código curto — gere o link de novo com os mesmos dados para criar um.</p>
                )}
                <p className="mt-1 break-all select-all text-neutral-500">{l.url}</p>
              </li>
            ))}
            {links.data?.length === 0 && <li className="py-2 text-xs text-neutral-400">Nenhum link gerado ainda.</li>}
          </ul>
        </Card>
      </div>
    </StaffShell>
  );
}

/**
 * Endereço curto do link, montado no navegador a partir do domínio em que a
 * página está aberta — não há env var nova, e em preview da Vercel o link
 * copiado aponta para o próprio preview em vez de para produção.
 */
function curto(link: CampaignLinkDto): string | null {
  if (!link.slug) return null;
  // Guarda de SSR: a lista só existe depois do fetch no cliente, mas um render
  // no servidor com `window` indefinido derrubaria a página inteira.
  const origem = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origem}/i/${link.slug}`;
}

function CopiarBotao({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      className="mt-3"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? 'Copiado' : 'Copiar link'}
    </Button>
  );
}
