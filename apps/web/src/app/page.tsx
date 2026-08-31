import Link from 'next/link';

/**
 * Landing pública (RF-06/PDR-018). Server Component sem estado: quem já tem conta
 * clica em "Entrar", quem não tem vai para /cadastro. Preços vêm de 09-ux/copy.md
 * (mesma fonte da tela de assinatura — não duplicar valor aqui sem atualizar lá).
 */
export const metadata = {
  title: 'Messa — o garçom virtual do seu restaurante',
  description:
    'Seu cliente escaneia o QR Code da mesa e faz o pedido pelo celular. Sua equipe recebe na hora, no mesmo lugar onde já trabalha. 14 dias grátis, sem cartão.',
};

const PLANS = [
  { name: 'Mensal', price: 'R$ 149', period: '/mês', note: 'Sem fidelidade, cancele quando quiser.', highlight: false },
  { name: 'Semestral', price: 'R$ 800', period: '/6 meses', note: 'Economia de R$ 94 em relação ao mensal.', highlight: true },
  { name: 'Anual', price: 'R$ 1.500', period: '/ano', note: 'Economia de R$ 288 em relação ao mensal.', highlight: false },
];

const STEPS = [
  { n: '1', title: 'Cole o QR Code na mesa', body: 'A gente gera os cartazes prontos para imprimir, um por mesa, com o nome do seu restaurante.' },
  { n: '2', title: 'O cliente pede pelo celular', body: 'Ele escaneia, vê o cardápio com fotos e preços atualizados e monta o pedido sem instalar nada.' },
  { n: '3', title: 'Sua equipe recebe na hora', body: 'O pedido aparece no painel com som e notificação. O garçom confirma e leva — sem comanda de papel.' },
];

const FEATURES = [
  { title: 'O garçom continua no controle', body: 'Nada é liberado sozinho: o caixa aprova cada mesa antes de abrir o atendimento. O garçom também pode lançar pedidos pelo mesmo sistema.' },
  { title: 'Não substitui seu PDV', body: 'A Messa cuida do pedido na mesa. Seu sistema de caixa, sua impressora e sua cozinha continuam funcionando do mesmo jeito.' },
  { title: 'Cardápio que você edita sozinho', body: 'Mudou o preço? Acabou o prato? Você altera em segundos pelo celular e todo mundo na casa vê na hora.' },
  { title: 'PIN por mesa, sem bagunça', body: 'Cada mesa tem um PIN de 4 dígitos. A galera toda pede junto na mesma comanda, sem ninguém entrar por engano na conta do vizinho.' },
  { title: 'Funciona no celular do garçom', body: 'Ele entra uma vez pelo aparelho dele e continua conectado. Se sair da equipe, você revoga o acesso com um clique.' },
  { title: 'Pedir a conta sem levantar a mão', body: 'O cliente pede a conta pelo próprio celular. O painel avisa, o garçom confirma e leva a maquininha já sabendo o valor.' },
];

const FAQ = [
  { q: 'Preciso trocar meu sistema de caixa?', a: 'Não. A Messa cuida do pedido na mesa e mostra o consumo consolidado. O fechamento e o pagamento continuam no seu PDV, do jeito que sua equipe já faz.' },
  { q: 'O cliente precisa baixar aplicativo?', a: 'Não. Ele aponta a câmera para o QR Code da mesa e o cardápio abre direto no navegador do celular.' },
  { q: 'E se a internet do restaurante cair?', a: 'O sistema avisa a sua equipe na hora que a conexão caiu, e o cliente é orientado a chamar um garçom em vez de fazer um pedido que ninguém veria.' },
  { q: 'Como funciona a cobrança?', a: 'São 14 dias grátis, sem cartão. Depois você paga por Pix a cada ciclo — o QR Code é gerado aqui e o acesso é liberado sozinho assim que o pagamento cai. Não guardamos cartão nem cobramos sozinhos.' },
  { q: 'Quantas mesas posso cadastrar?', a: 'Quantas quiser, em qualquer plano. O preço não muda por mesa nem por pedido.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold">Messa</span>
          <nav className="flex items-center gap-2 text-sm">
            <a href="#como-funciona" className="hidden rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 sm:block">
              Como funciona
            </a>
            <a href="#precos" className="hidden rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 sm:block">
              Preços
            </a>
            <Link href="/staff/login" className="rounded-lg px-3 py-1.5 text-neutral-700 hover:bg-neutral-100">
              Entrar
            </Link>
            <Link href="/cadastro" className="rounded-lg bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-700">
              Testar grátis
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
          <span className="inline-block rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">14 dias grátis · sem cartão</span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Seu cliente pede pelo celular.
            <br />
            Sua equipe recebe na hora.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-neutral-600">
            A Messa é o garçom virtual do seu restaurante: o cliente escaneia o QR Code da mesa, monta o pedido sozinho e a comanda cai direto no painel da
            sua equipe — sem papel, sem fila no caixa, sem trocar o seu sistema.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/cadastro" className="w-full rounded-xl bg-rose-600 px-6 py-3 font-semibold text-white hover:bg-rose-700 sm:w-auto">
              Criar minha conta grátis
            </Link>
            <a href="#como-funciona" className="w-full rounded-xl border border-neutral-300 px-6 py-3 font-semibold text-neutral-700 hover:bg-neutral-50 sm:w-auto">
              Ver como funciona
            </a>
          </div>
          <p className="mt-4 text-sm text-neutral-500">Leva 1 minuto para criar a conta. Você já sai com o cardápio e os QR Codes das mesas prontos.</p>
        </section>

        {/* Problema */}
        <section className="border-y border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-2xl font-bold">O que trava o atendimento hoje</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                'Cliente de mão levantada esperando alguém passar para pedir mais uma bebida.',
                'Comanda de papel que some, rasga ou volta ilegível para a cozinha.',
                'Garçom subindo e descendo só para anotar o que já estava decidido na mesa.',
                'Mesa cheia esperando a conta enquanto alguém vai até o caixa perguntar.',
              ].map((item) => (
                <li key={item} className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-neutral-700">
                  <span aria-hidden className="text-rose-600">
                    ✕
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-center text-2xl font-bold">Como funciona</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-neutral-200 p-6">
                <span className="flex size-9 items-center justify-center rounded-full bg-rose-600 font-bold text-white">{s.n}</span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-neutral-600">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Diferenciais */}
        <section className="border-y border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-5xl px-4 py-16">
            <h2 className="text-2xl font-bold">Feito para restaurante de verdade</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-neutral-600">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Preços */}
        <section id="precos" className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-center text-2xl font-bold">Preço único, sem taxa por pedido</h2>
          <p className="mt-2 text-center text-neutral-600">Mesas ilimitadas, equipe ilimitada. Comece com 14 dias grátis, sem cartão.</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.name} className={`rounded-2xl border p-6 ${p.highlight ? 'border-rose-600 ring-1 ring-rose-600' : 'border-neutral-200'}`}>
                {p.highlight && <span className="mb-2 inline-block rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">Mais escolhido</span>}
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-2">
                  <span className="text-3xl font-bold">{p.price}</span>
                  <span className="text-neutral-500">{p.period}</span>
                </p>
                <p className="mt-2 text-sm text-neutral-600">{p.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-neutral-500">
            Pagamento por Pix, com liberação automática. Não guardamos cartão nem cobramos sozinhos no ciclo seguinte.
          </p>
        </section>

        {/* FAQ */}
        <section className="border-t border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-3xl px-4 py-16">
            <h2 className="text-2xl font-bold">Perguntas frequentes</h2>
            <div className="mt-6 space-y-3">
              {FAQ.map((item) => (
                <details key={item.q} className="rounded-xl border border-neutral-200 bg-white p-4">
                  <summary className="cursor-pointer font-medium">{item.q}</summary>
                  <p className="mt-2 text-sm text-neutral-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold">Experimente hoje no seu restaurante</h2>
          <p className="mt-2 text-neutral-600">14 dias grátis, sem cartão. Se não fizer sentido, é só parar de usar.</p>
          <Link href="/cadastro" className="mt-6 inline-block rounded-xl bg-rose-600 px-6 py-3 font-semibold text-white hover:bg-rose-700">
            Criar minha conta grátis
          </Link>
        </section>
      </main>

      <footer className="border-t border-neutral-200">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-neutral-500 sm:flex-row">
          <span>Messa · seu garçom virtual</span>
          <nav className="flex gap-4">
            <Link href="/privacidade" className="hover:text-neutral-800">
              Privacidade
            </Link>
            <Link href="/staff/login" className="hover:text-neutral-800">
              Entrar
            </Link>
            <Link href="/cadastro" className="hover:text-neutral-800">
              Criar conta
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
