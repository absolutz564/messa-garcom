/** Fonte: docs/09-ux/copy.md. Manter os dois sincronizados. */
export const ptBR = {
  menu: {
    cta: { start: 'Iniciar atendimento com Garçom Virtual' },
  },
  request: {
    sent: '⏳ Solicitação enviada ao caixa...',
    waiting: {
      title: 'Aguarde a liberação',
      body: 'O responsável pelo caixa vai liberar seu atendimento em instantes.',
    },
    rejected: 'O restaurante não liberou o atendimento nesta mesa. Se precisar, chame um garçom.',
    expired: 'O restaurante não respondeu a tempo. Chame um garçom ou tente novamente.',
    blocked: 'Você fez várias solicitações recentemente. Aguarde alguns minutos ou chame um garçom.',
  },
  session: {
    pin: { share: 'Compartilhe com sua mesa: {pin}' },
    join: {
      title: 'Esta mesa está em atendimento',
      body: 'Digite o PIN informado por quem iniciou o atendimento.',
      noPin: 'Não tenho o PIN — solicitar atendimento',
      invalid: 'PIN inválido. Confira com quem está na mesa.',
      locked: 'Muitas tentativas. Aguarde alguns minutos ou chame um garçom.',
    },
    closed: {
      title: 'Atendimento encerrado',
      body: 'Obrigado! Para um novo atendimento, escaneie o QR Code novamente.',
    },
  },
  resume: {
    title: '⏳ Aguarde a confirmação do restaurante',
    body:
      'Este atendimento ficou mais de 1 hora sem novos pedidos. Para garantir que seu pedido não seja incluído por engano na conta de outro cliente que esteve nesta mesa anteriormente, o responsável pelo caixa precisa confirmar o atendimento. Aguarde a confirmação para continuar.',
    sent: '⏳ Solicitação enviada ao caixa...',
  },
  product: {
    unavailable: 'Indisponível',
    areaClosed: { kitchen: 'Cozinha encerrada', bar: 'Bar encerrado' },
  },
  order: {
    sent: 'Pedido enviado!',
    send: 'Enviar pedido',
    cart: 'Seu pedido',
    consumption: 'Consumo da mesa',
    empty: 'Nenhum pedido ainda.',
    /** Rótulos para o CLIENTE (o staff usa "Lançado no caixa"). */
    status: { pending_confirmation: 'Aguardando confirmação', submitted: 'Enviado', acknowledged: 'Confirmado', cancelled: 'Cancelado' },
    staffStatus: { pending_confirmation: 'Aguardando confirmação', submitted: 'A lançar', acknowledged: 'Lançado', cancelled: 'Cancelado' },
    namePrompt: 'Seu nome (opcional)',
    nameHint: 'Só o primeiro nome, para o garçom saber a quem entregar. Apagado ao fim do atendimento.',
    cancelOwn: 'Cancelar',
    notesPlaceholder: 'Observação (ex.: sem cebola)',
    rejectedItems: 'Alguns itens não estão mais disponíveis e foram removidos: {items}',
  },
  staff: {
    request: {
      title: '{table} — Solicitação de atendimento',
      approve: 'LIBERAR',
      reject: 'RECUSAR',
    },
    resume: {
      title: '{table} — Atendimento inativo há {duration}',
      body: 'Um cliente quer fazer um pedido nesta mesa. A comanda atual tem {orderCount} pedidos ({total}).',
      newSession: 'Encerrar sessão anterior e iniciar nova (Novo Cliente)',
      continue: 'Continuar sessão anterior',
    },
    order: { ack: 'Lançado no caixa', cancel: 'Cancelar pedido', queueTitle: 'Pedidos a lançar', pendingConfirmation: 'Aguardando confirmação do atendimento' },
    session: {
      close: {
        pending: {
          title: 'Esta mesa tem {count} pedidos ainda não lançados no caixa',
          force: 'Encerrar mesmo assim',
        },
      },
    },
    area: {
      close: { kitchen: 'Encerrar cozinha', bar: 'Encerrar bar' },
      open: { kitchen: 'Reabrir cozinha', bar: 'Reabrir bar' },
    },
    table: {
      state: {
        free: 'Livre',
        requested: 'Solicitação pendente',
        occupied: 'Em atendimento',
        inactive: 'Inativa',
        disabled: 'Desativada',
      },
    },
  },
} as const;
