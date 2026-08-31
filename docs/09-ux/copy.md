# Textos Oficiais (pt-BR)

Chaves em `packages/contracts/src/i18n/pt-BR.ts`. Textos aqui são a fonte; mudanças exigem atualização dos dois.

## Cliente
| Chave | Texto |
|---|---|
| `menu.cta.start` | Iniciar atendimento com Garçom Virtual |
| `request.sent` | ⏳ Solicitação enviada ao caixa... |
| `request.waiting.title` | Aguarde a liberação |
| `request.waiting.body` | O responsável pelo caixa vai liberar seu atendimento em instantes. |
| `request.rejected` | O restaurante não liberou o atendimento nesta mesa. Se precisar, chame um garçom. |
| `request.expired` | O restaurante não respondeu a tempo. Chame um garçom ou tente novamente. |
| `request.blocked` | Você fez várias solicitações recentemente. Aguarde alguns minutos ou chame um garçom. |
| `session.pin.share` | Compartilhe com sua mesa: **{pin}** |
| `session.join.title` | Esta mesa está em atendimento |
| `session.join.body` | Digite o PIN informado por quem iniciou o atendimento. |
| `session.join.noPin` | Não tenho o PIN — solicitar atendimento |
| `session.join.invalid` | PIN inválido. Confira com quem está na mesa. |
| `session.join.locked` | Muitas tentativas. Aguarde alguns minutos ou chame um garçom. |
| `session.closed.title` | Atendimento encerrado |
| `session.closed.body` | Obrigado! Para um novo atendimento, escaneie o QR Code novamente. |
| `resume.title` | ⏳ Aguarde a confirmação do restaurante |
| `resume.body` | Este atendimento ficou mais de 1 hora sem novos pedidos. Para garantir que seu pedido não seja incluído por engano na conta de outro cliente que esteve nesta mesa anteriormente, o responsável pelo caixa precisa confirmar o atendimento. Aguarde a confirmação para continuar. |
| `resume.sent` | ⏳ Solicitação enviada ao caixa... |
| `bill.cta` | Pedir a conta |
| `bill.confirmTitle` | Pedir a conta? |
| `bill.confirmBody` | O garçom vai levar a conta até a mesa. Depois disso não é possível fazer novos pedidos neste atendimento. |
| `bill.requested` | Conta solicitada ✔ |
| `bill.requestedBody` | Aguarde — o garçom vai levar a conta até você. |
| `bill.onTheWay` | Sua conta está a caminho 🧾 |
| `bill.onTheWayBody` | Total {total}. Obrigado pela preferência! |
| `staff.bill.title` | {table} pediu a conta |
| `staff.bill.ack` | Confirmar — levar a conta |
| `staff.bill.close` | Pago — encerrar atendimento |
| `product.unavailable` | Indisponível |
| `product.areaClosed.kitchen` | Cozinha encerrada |
| `product.areaClosed.bar` | Bar encerrado |
| `order.sent` | Pedido enviado! |
| `order.rejectedItems` | Alguns itens não estão mais disponíveis e foram removidos: {items} |
| `offline.title` | Não há ninguém da equipe conectado no momento |
| `offline.body` | Chame um garçom para fazer seu pedido — ele registra para você. |
| `offline.warn` | Não há ninguém da equipe conectado no momento. Seu pedido fica registrado, mas pode demorar a ser visto — se precisar, chame um garçom. |

## Operador
| Chave | Texto |
|---|---|
| `staff.request.title` | {table} — Solicitação de atendimento |
| `staff.request.approve` | LIBERAR |
| `staff.request.reject` | RECUSAR |
| `staff.resume.title` | {table} — Atendimento inativo há {duration} |
| `staff.resume.body` | Um cliente quer fazer um pedido nesta mesa. A comanda atual tem {orderCount} pedidos ({total}). |
| `staff.resume.newSession` | Encerrar sessão anterior e iniciar nova (Novo Cliente) |
| `staff.resume.continue` | Continuar sessão anterior |
| `staff.order.ack` | Lançado no caixa |
| `staff.session.close.pending.title` | Esta mesa tem {count} pedidos ainda não lançados no caixa |
| `staff.session.close.pending.force` | Encerrar mesmo assim |
| `staff.area.close.kitchen` | Encerrar cozinha |
| `staff.area.open.kitchen` | Reabrir cozinha |
| `staff.table.state.free` | Livre |
| `staff.table.state.requested` | Solicitação pendente |
| `staff.table.state.occupied` | Em atendimento |
| `staff.table.state.inactive` | Inativa |
| `staff.table.state.disabled` | Desativada |
| `staff.offline.title` | Sem conexão com o Messa |
| `staff.offline.body` | Os dados na tela são de {time} e podem estar desatualizados. Solicitações e pedidos novos não aparecem até a conexão voltar. |
| `staff.offline.hint` | Enquanto isso, abra o painel no celular pelo 4G: messa-garcom.com.br/staff |
| `staff.offline.retry` | Tentar agora |
