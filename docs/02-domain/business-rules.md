# Regras de Negócio — "Constituição"

Estas regras são implementadas **exclusivamente no backend**. Qualquer código que as contradiga está errado, ou esta página precisa de uma PDR nova.

## BR-01 Isolamento
Toda leitura e escrita é filtrada por `tenant_id`, tanto na aplicação quanto por RLS. Não existe endpoint "cross-tenant" fora do Super Admin, que usa role de banco distinta e é auditado.

## BR-02 QR não concede acesso
Resolver `public_token` retorna: tenant, mesa, estado da mesa, cardápio. Nunca retorna sessão, PIN ou pedidos.

## BR-03 Solicitação de atendimento (`open_session`)
Ao receber `POST /public/tables/{token}/requests`, em transação com lock na mesa:
1. Mesa inativa/inexistente ⇒ 404.
2. Tenant bloqueado ⇒ 403.
3. `DeviceBlock` vigente para (mesa, device) ⇒ 429 `{blocked_until}`. Nenhuma notificação ao operador.
4. Request `pending` para (mesa, device) ⇒ 200 com a existente (idempotente).
5. Rate limit da mesa (5 solicitações `open_session` / 10 min, qualquer device — solicitações `resume_session` geradas por pedidos não contam) ⇒ 429.
6. Mesa `OCCUPIED` ⇒ 409 `{reason: "session_active"}` — cliente deve usar PIN.
7. Mesa `FREE` ou `INACTIVE` ⇒ cria request `pending`, `expires_at = now + 10 min`, evento `request.created`.

## BR-04 Recusa e bloqueio
Ao recusar: request ⇒ `rejected`. Se existem ≥ 2 rejeições do mesmo (mesa, device) nos últimos 15 min ⇒ cria `DeviceBlock` até `now + 30 min`. Expirações e cancelamentos não contam.

## BR-05 Aprovação (`open_session`, mesa FREE)
Em transação com lock na mesa: request ainda `pending` e mesa ainda `FREE`, senão 409. Cria `Session(active)`, gera PIN, cria `SessionParticipant(ordinal=1, joined_via=approval)`, request ⇒ `approved`, demais requests pendentes da mesa ⇒ `expired`, evento `session.opened`.

## BR-06 Aprovação (`open_session`, mesa INACTIVE) — PDR-003
Operador vê as duas opções de BR-10. "Nova" ⇒ BR-10a com o device como participante 1. "Continuar" ⇒ device adicionado como participante da sessão antiga, sessão ⇒ `active`.

## BR-07 PIN
- 4 dígitos, CSPRNG, cifrado com chave do servidor (PDR-005). Nunca `0000`/`1234`-like? **Não** — restringir reduz entropia; aceitar qualquer.
- `join` verifica: sessão `active|inactive`, `pin_locked_until` não vigente, PIN correto.
- Falha: `pin_failed_attempts++`; ≥ 10 ⇒ `pin_locked_until = now + 15 min` + evento `session.pin_locked` (alerta ao operador). Por device: 5 falhas / 10 min ⇒ 429.
- Sucesso zera `pin_failed_attempts`.
- Sessão `closed` ⇒ PIN inválido sempre.
- Staff nunca precisa de PIN.

## BR-08 Inatividade
Job a cada 60 s: `active` com `last_activity_at < now − 1h` ⇒ `inactive`. Evento `session.became_inactive`. **Nunca encerra.**
`last_activity_at` é atualizado apenas por: criação de pedido `submitted`, decisão "continuar", pedido de garçom. Entrada de participante **não** conta como atividade.

## BR-09 Pedido em sessão inativa
- Ator **cliente**: cria `Order(pending_confirmation)` + `ServiceRequest(resume_session)` ligada ao pedido (idempotente por (mesa, device) pendente). Cliente vê mensagem oficial (`09-ux/copy.md`). Enquanto pendente, novos `POST orders` do mesmo device ⇒ 409 `{reason: "awaiting_confirmation"}`.
- Ator **garçom** (PDR-002): pedido `submitted`, sessão ⇒ `active`.

## BR-10 Decisão do operador (resume)
**a) Encerrar anterior e iniciar nova:** em transação: sessão antiga ⇒ `closed(replaced_by_new)`; nova `Session(active)` + novo PIN; participante solicitante migra (`joined_via=migrated`, ordinal 1); `Order` pendente re-vinculado à nova sessão ⇒ `submitted` (sequence_no 1); request ⇒ `approved(new_session)`. Demais participantes da antiga perdem acesso.
**b) Continuar:** sessão ⇒ `active`, `last_activity_at=now`; `Order` ⇒ `submitted`; request ⇒ `approved(continue_session)`.
Recusar ⇒ `Order` ⇒ `cancelled(request_rejected)`, conta para BR-04.

## BR-11 Validação de pedido
Para cada item: produto do tenant, `deleted_at IS NULL`, `is_available`, `service_area.is_open`, `quantity ∈ [1, 50]`. Qualquer falha ⇒ 422 com lista `{product_id, reason}`. Snapshot de nome/preço. Total calculado no servidor. `Idempotency-Key` obrigatório.

## BR-12 Área de serviço fechada
Fechamento é imediato para novos pedidos. Pedidos existentes não são afetados. Participantes já na sessão não contornam (validação em BR-11).

## BR-13 Encerrar sessão — PDR-004
Se existem pedidos `submitted` (não acknowledged) ⇒ 409 `{pending_orders: [...]}`. Com `force=true` ⇒ pedidos ⇒ `cancelled(session_closed_unacknowledged)`, sessão ⇒ `closed(forced_with_pending)`. Sem pendências ⇒ `closed(manual)`. Sempre: PIN inválido, participantes recebem `session.closed`.

## BR-18 Pedido de conta (RF-68)
- Cliente participante pede a conta ⇒ `sessions.bill_requested_at` (idempotente); evento `bill.requested` para o painel. **Não encerra a sessão.**
- Com a conta pedida, **clientes não criam pedidos** (409 `bill_requested`); staff ainda pode (correções). O cliente pode desistir enquanto o staff não confirmou.
- Staff confirma (`bill_acknowledged_at`) ⇒ cliente vê "Sua conta está a caminho" com o total. O encerramento continua sendo a ação explícita após o pagamento (BR-13).
- "Continuar sessão" após inatividade mantém o estado da conta; "nova sessão" começa sem pedido de conta.

## BR-19 Presença da equipe (RF-83, PDR-016)
A equipe está **online** para um tenant enquanto houver ao menos um socket de staff na room `tenant:{id}` — qualquer dispositivo serve (o computador do caixa, o celular do garçom no 4G). Sem nenhum socket, o tenant fica **offline** após uma carência de 45 s (reload de página não pode virar offline); qualquer reconexão volta a online imediatamente.

Ações do cliente com a equipe offline:

| Ação | Depende de humano? | Com a equipe offline |
|---|---|---|
| `open_session` (iniciar atendimento, inclusive "não tenho o PIN") | Sim — operador libera | **409 `staff_offline`.** A solicitação expiraria em 10 min (BR-03) sem ninguém para aprovar. |
| Pedido que cai em `resume_session` (BR-09, sessão inativa) | Sim — caixa confirma | **409 `staff_offline`.** A expiração cancelaria o pedido (BR-10). |
| Pedido em sessão `active` | Não | **Permitido.** É gravado e aparece no painel na reconexão; o cliente vê um aviso, nunca um erro. |
| Pedir a conta (BR-18) | Sim, mas sem prazo | **Permitido.** Fica pendente até alguém ver; o cliente vê o mesmo aviso. |
| Entrar com PIN | Não | **Permitido.** |

Presença é validada no backend (RNF-02): o frontend apenas antecipa o bloqueio para não deixar o cliente tocar num botão que vai falhar. Presença **não** é evento de domínio — é estado de transporte, efêmero, não vai para a outbox nem para `domain_events` (ADR-005).

## BR-14 Garçom
- Mesa FREE ⇒ abre sessão diretamente (PDR-001), `opened_by=waiter`.
- Mesa OCCUPIED/INACTIVE ⇒ acesso direto.
- Mesa REQUESTED ⇒ pode abrir; requests pendentes ⇒ `expired` (o cliente é orientado a usar o PIN informado pelo garçom).
- Pedido de garçom: `created_by_kind=staff`, `user_id`.

## BR-15 Preço e nome
`OrderItem` guarda snapshot. Alterar produto nunca altera pedidos existentes.

## BR-16 Concorrência
Toda operação que muda estado de mesa/sessão/solicitação executa dentro de uma transação que faz `SELECT id FROM tables WHERE id = ? FOR UPDATE` primeiro. Constraints parciais no banco são a última linha de defesa.

## BR-17 Auditoria
Toda transição grava `DomainEvent` com `actor` (`{kind: customer|staff|system, id}`) na mesma transação.

## BR-20 Cobrança da assinatura (RF-05) — PDR-017
- Cada tenant nasce em `billingStatus=trial`, `trialEndsAt = createdAt + 14 dias`. Ao primeiro pagamento confirmado, `billingStatus=active` e permanece assim (renovações só estendem `subscriptionEndsAt`; não há um estado "past_due" persistido — é sempre derivado das datas na leitura, nunca salvo, para não haver dessincronia entre o gate e a tela).
- Planos e ciclo: Mensal R$ 149 / 30 dias, Semestral R$ 800 / 180 dias, Anual R$ 1.500 / 365 dias. Renovar estende a partir do vencimento vigente quando ainda no futuro (quem paga adiantado não perde dias).
- Acesso do tenant, calculado a cada leitura a partir de `(billingStatus, trialEndsAt, subscriptionEndsAt, now)`:
  1. `now` até o vencimento (trial ou assinatura) ⇒ liberado.
  2. Até 3 dias após o vencimento (carência) ⇒ liberado, com aviso.
  3. Depois da carência ⇒ **bloqueado**: `POST /public/tables/{token}/requests` (`open_session`), `resume_session` e o garçom abrindo mesa livre diretamente (BR-14) recusam com `billing_blocked`. O staff nunca pode virar uma via de escape do bloqueio — sem isso, bastaria orientar a equipe a nunca deixar o cliente usar o QR e sempre abrir a mesa pelo painel. Sessões já abertas, pedidos em andamento, login de staff e a própria tela de cobrança **nunca** são afetados — o admin sempre consegue entrar para pagar.
  4. `subscriptionEndsAt IS NULL` (tenant migrado antes deste controle existir) ⇒ nunca bloqueia.
- Renovação automática: 5 dias antes do vencimento, se não houver cobrança Pix pendente válida, o sistema gera uma sozinho (plano = último escolhido pelo admin, ou Mensal por padrão) e publica `billing.charge_created` (evento para banner/e-mail). Job roda a cada 5 min.
- Confirmação: **automática, nunca manual**. Job de fundo consulta o Mercado Pago para toda cobrança `pending` não expirada; a tela de cobrança também consulta enquanto aberta (mesma função). Pagamento confirmado ⇒ estende `subscriptionEndsAt`, `billingStatus=active`, evento `billing.paid`. Nenhum cartão é guardado; nenhuma cobrança é gerada sem que o restaurante volte a pagar a cada ciclo — não é débito automático.
- Cobrança expira em 30 min sem pagamento (mesma janela do Terap-IA Kids); expirada não bloqueia nem soma a nenhuma janela de anti-spam.
- Bloqueio por cobrança é **independente** do bloqueio manual do Super Admin (`tenants.status`, BR-01) — nunca escreve nesse campo, para não trancar o admin fora do painel exatamente quando ele precisa pagar.

## BR-21 Cadastro self-service (RF-06) — PDR-018
- `POST /auth/signup`: nome do restaurante, nome do admin, e-mail, senha, aceite da Política de Privacidade. Sem verificação de e-mail, sem CAPTCHA — rate limit por IP (10/hora) é a única barreira, mesmo padrão do Terap-IA Kids.
- Cria tenant (trial de 14 dias, BR-20) + usuário admin + membership `active` + áreas de serviço padrão — mesma transação de `platform.service.create`, mas com slug gerado automaticamente a partir do nome (nunca exposto no formulário) e ator `{kind: 'staff', id: novoUsuário}` no evento `tenant.created`.
- **E-mail já cadastrado ⇒ 409 `email_in_use`, nunca reaproveita a conta.** Diferente do fluxo do Super Admin (RF-72, que reaproveita usuário existente por e-mail): ali um humano confiável já verificou a solicitação fora da banda; aqui qualquer um poderia digitar o e-mail de outra pessoa sem provar posse da caixa, e reaproveitar significaria anexar uma membership de admin nova à conta de um estranho sem consentimento.
- Sucesso ⇒ login automático (mesmo `AuthService.login`) e cookies de sessão emitidos na resposta — o dono do restaurante cai direto no `/admin`, sem passo extra.

## BR-22 Recuperação de senha (RF-75)
- `POST /auth/forgot-password` responde **204 sempre**, exista ou não a conta. Resposta diferente transformaria a rota pública num verificador de "quem tem conta na Messa" — mesma razão pela qual o login usa uma única mensagem para e-mail inexistente e senha errada.
- Token: 24 bytes aleatórios, enviado só por e-mail; o banco guarda **apenas o SHA-256** (`users.password_reset_token_hash`), igual ao convite de equipe. Validade de 1 hora.
- `POST /auth/reset-password` troca a senha e **revoga todos os `staff_devices` do usuário**: se o pedido veio de quem perdeu o acesso, quem estivesse logado indevidamente cai junto.
- Rate limit por IP: 5 pedidos / 15 min para solicitar, 10 / 15 min para consumir.
- Um pedido novo invalida o anterior (o hash é sobrescrito). Token usado é apagado.

## BR-23 Aquisição (RF-07) — PDR-020
- O sujeito atribuído é o **restaurante** (`subjectType='tenant'`), não a pessoa: quem a Messa adquire é a casa, e é a assinatura dela que paga a mídia.
- A origem é capturada no navegador (cookie de primeira parte, sem httpOnly) e gravada **no cadastro** — depois não há como recuperá-la, o parâmetro da URL se perde na primeira navegação. Sem cookie, o cadastro conta como `direct`: origem desconhecida é resposta legítima, não falha.
- Guarda **dois toques**: primeiro (quem apresentou o produto) e último (o que fez decidir). O relatório credita um ou outro conforme o modelo escolhido; olhar só o último corta verba de quem enche o topo do funil.
- Marcos, um por tenant (repetir não conta de novo — contar dividiria o custo por cliente a cada ciclo):
  - `cadastrou` — criação da conta pelo cadastro self-service (BR-21);
  - `ativou` — **primeiro pedido de um cliente de verdade**. Pedido de garçom não conta: a equipe testando o sistema não é sinal de que a aquisição funcionou;
  - `pagou` — primeira cobrança confirmada (BR-20), com o valor, para o relatório saber quanto o canal devolveu.
- Toda escrita de aquisição é **best-effort**: falha vira log, nunca exceção. Ela acontece no meio de cadastro, pedido e confirmação de pagamento — nenhum desses pode cair porque a tabela de marketing estava indisponível.
- Gasto de mídia é lançado à mão pelo Super Admin, com a mesma origem/campanha do link do anúncio. Os links são gerados e guardados em `/platform/aquisicao` justamente para o nome não ser digitado de memória semanas depois.
- LGPD: o cookie guarda campanha, caminho de entrada **sem query string** e apenas o **host** de quem indicou — nada de identificador pessoal. A captura não roda no cardápio do cliente (`/t/[token]`): ali quem escaneia é o cliente do restaurante, não um restaurante em potencial.
- Tabelas da plataforma, sem `tenant_id` e sem RLS (como `users`): o acesso é restrito a `/platform` na aplicação.
