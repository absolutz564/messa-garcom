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
