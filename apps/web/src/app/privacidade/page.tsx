import type { Metadata } from 'next';
import { BackLink } from '@/components/back-link';

export const metadata: Metadata = { title: 'Política de Privacidade · Messa' };

/** Texto baseado em docs/05-security/lgpd.md. Revisar com apoio jurídico antes do piloto. */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 text-neutral-800">
      <BackLink />
      <h1 className="text-2xl font-bold">Política de Privacidade</h1>
      <p className="mt-1 text-sm text-neutral-500">Messa — Garçom Virtual · última atualização: 29/08/2026</p>

      <section className="mt-6 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">1. O que é o Messa</h2>
        <p>O Messa é um serviço que permite fazer pedidos em bares e restaurantes pelo celular, a partir do QR Code da mesa. O restaurante que você está visitando é o responsável pelo atendimento e pelos seus dados como cliente; o Messa opera a tecnologia em nome dele.</p>

        <h2 className="text-lg font-semibold">2. Dados de clientes (quem usa o QR Code)</h2>
        <p>
          <strong>Não pedimos nome, telefone, e-mail, CPF nem localização.</strong> Para funcionar, o Messa guarda no seu navegador dois cookies estritamente necessários:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Identificador do dispositivo</strong> — um código aleatório, sem relação com você, usado apenas para evitar solicitações repetidas de atendimento (proteção contra abuso). Validade: 1 ano.
          </li>
          <li>
            <strong>Vínculo com o atendimento</strong> — identifica que este celular participa do atendimento da mesa atual. Expira quando o atendimento é encerrado.
          </li>
        </ul>
        <p>Você pode, se quiser, informar um <strong>primeiro nome ou apelido</strong> para que o garçom saiba a quem entregar o pedido. É opcional, fica visível apenas para a equipe do restaurante durante o atendimento e é <strong>apagado automaticamente quando o atendimento é encerrado</strong>.</p>
        <p>Os pedidos feitos ficam registrados para o restaurante (itens, valores, horários), sem identificação pessoal. O endereço IP pode constar em registros técnicos de segurança por até 30 dias. Não usamos rastreamento por impressão digital do navegador nem cookies de publicidade.</p>

        <h2 className="text-lg font-semibold">3. Dados de funcionários dos restaurantes</h2>
        <p>Nome, e-mail e senha (armazenada apenas como hash) são tratados para dar acesso ao sistema, pelo tempo em que o vínculo com o restaurante estiver ativo. Dispositivos conectados podem ser desconectados pelo administrador do restaurante a qualquer momento.</p>

        <h2 className="text-lg font-semibold">4. Base legal e finalidade</h2>
        <p>Tratamos os dados com base na execução do serviço solicitado por você (o pedido) e no legítimo interesse de prevenir abusos e manter a segurança, nos termos da LGPD (Lei 13.709/2018).</p>

        <h2 className="text-lg font-semibold">5. Compartilhamento</h2>
        <p>Os dados são compartilhados apenas com o restaurante que você está visitando e com os provedores de infraestrutura necessários para operar o serviço (hospedagem e banco de dados). Não vendemos dados.</p>

        <h2 className="text-lg font-semibold">6. Seus direitos</h2>
        <p>Você pode apagar os cookies do seu navegador a qualquer momento — isso remove qualquer vínculo com este dispositivo. Funcionários podem solicitar a exclusão da sua conta ao administrador do restaurante. Para outras solicitações previstas na LGPD, fale com o restaurante ou conosco pelo e-mail abaixo.</p>

        <h2 className="text-lg font-semibold">7. Contato</h2>
        <p>
          Encarregado de dados: <a className="underline" href="mailto:privacidade@messa-garcom.com.br">privacidade@messa-garcom.com.br</a>
        </p>
      </section>
      <div className="mt-8">
        <BackLink label="← Voltar ao cardápio" />
      </div>
    </main>
  );
}
