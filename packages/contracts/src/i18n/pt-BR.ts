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
  bill: {
    cta: 'Pedir a conta',
    confirmTitle: 'Pedir a conta?',
    confirmBody: 'O garçom vai levar a conta até a mesa. Depois disso não é possível fazer novos pedidos neste atendimento.',
    confirmAction: 'Sim, pedir a conta',
    requested: 'Conta solicitada ✔',
    requestedBody: 'Aguarde — o garçom vai levar a conta até você.',
    cancel: 'Cancelar pedido de conta',
    onTheWay: 'Sua conta está a caminho 🧾',
    onTheWayBody: 'Total {total}. Obrigado pela preferência!',
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
  /** BR-19 — equipe do restaurante sem conexão. */
  offline: {
    title: 'Não há ninguém da equipe conectado no momento',
    body: 'Chame um garçom para fazer seu pedido — ele registra para você.',
    warn: 'Não há ninguém da equipe conectado no momento. Seu pedido fica registrado, mas pode demorar a ser visto — se precisar, chame um garçom.',
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
    bill: {
      title: '{table} pediu a conta',
      body: '{orderCount} pedidos · {total}{pending}',
      ack: 'Confirmar — levar a conta',
      acked: 'Conta a caminho',
      close: 'Pago — encerrar atendimento',
      badge: 'Conta pedida',
    },
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
    /** BR-19 — painel sem conexão com a API. */
    offline: {
      title: 'Sem conexão com o Messa',
      body: 'Os dados na tela são de {time} e podem estar desatualizados. Solicitações e pedidos novos não aparecem até a conexão voltar.',
      hint: 'Enquanto isso, abra o painel no celular pelo 4G: messa-garcom.com.br/staff',
      retry: 'Tentar agora',
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
    /** BR-20 — banner de assinatura no painel. */
    billing: {
      trialBanner: 'Teste grátis — {days} dia(s) restante(s).',
      pastDueBanner: 'Pagamento pendente. Regularize em até {days} dia(s) para não bloquear novos atendimentos.',
      blockedBanner: 'Assinatura vencida — novos atendimentos estão bloqueados até o pagamento.',
      cta: 'Ver assinatura',
    },
  },
  /** BR-20 — tela de assinatura do admin. */
  billing: {
    title: 'Assinatura',
    plan: {
      monthly: 'Mensal — R$ 149/mês',
      semiannual: 'Semestral — R$ 800 a cada 6 meses (economia de R$ 94)',
      annual: 'Anual — R$ 1.500/ano (economia de R$ 288)',
    },
    status: {
      trial: 'Em teste — {days} dia(s) restante(s)',
      active: 'Ativa até {date}',
      pastDue: 'Pagamento pendente — regularize até {date} para não bloquear novos atendimentos',
      blocked: 'Assinatura vencida — novos atendimentos bloqueados até o pagamento',
    },
    pix: {
      generate: 'Gerar Pix',
      waiting: 'Aguardando pagamento...',
      confirmed: 'Pagamento confirmado! Assinatura renovada até {date}.',
      copy: 'Copiar código Pix',
      copied: 'Copiado',
      expired: 'Este Pix expirou. Gere um novo.',
      disclaimer: 'Não guardamos cartão nem cobramos sozinhos no próximo ciclo. Renovar é sempre uma ação sua — pague o Pix a cada vencimento.',
    },
    choosePlan: 'Escolher plano',
  },
} as const;
