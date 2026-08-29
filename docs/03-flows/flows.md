# Fluxos Principais (F01–F15)

Convenção: o backend é o único que muda estado; realtime apenas notifica. Referências `BR-xx` apontam para `02-domain/business-rules.md`.

## F01 — Cliente chega em mesa livre
1. Escaneia QR → `GET /t/{token}` (web) → `GET /public/tables/{token}`.
2. Backend resolve tenant + mesa (BR-02), emite/renova cookie `messa_device` (1 ano, HttpOnly).
3. Resposta: branding, `display_name`, `table_state=FREE`, cardápio.
4. UI: cardápio navegável sem carrinho + CTA **"Iniciar atendimento com Garçom Virtual"**.

## F02 — Cliente solicita atendimento
1. `POST /public/tables/{token}/requests` (BR-03).
2. Resposta 201 `{request_id, status: pending}` ou 429/409 conforme regra.
3. UI: "⏳ Solicitação enviada ao caixa…" + assinatura WS `request:{id}` (fallback: polling 3 s).
4. Após 10 min sem resposta ⇒ `expired`; UI: "O restaurante não respondeu. Chame um garçom."

## F03 — Operador aprova
1. Painel recebe `request.created` na room `tenant:{id}`; card com som.
2. `POST /staff/requests/{id}/approve` (BR-05). 409 se outro operador já agiu.

## F04 — Sessão criada
Mesma transação de F03: `Session(active)` + PIN + participante 1 + eventos `request.approved`, `session.opened`.

## F05 — Primeiro cliente entra
1. Device recebe `request.approved` → `POST /public/sessions/claim {request_id}` → cookie `messa_participant`.
2. UI: PIN em destaque ("Compartilhe com sua mesa: **5831**"), carrinho liberado, consumo da mesa (vazio).

## F06 — Segundo cliente entra (QR + PIN)
1. Escaneia → `table_state=OCCUPIED` → tela "Esta mesa está em atendimento. Digite o PIN".
2. `POST /public/sessions/join {token, pin}` (BR-07).
3. Sucesso ⇒ participante N (ordinal), cookie, mesma tela do F05 com consumo da mesa inteira.

## F07 — Cliente faz pedido
1. Carrinho local (por device) → `POST /sessions/{id}/orders` com `Idempotency-Key` (BR-11).
2. Sessão `active` ⇒ `Order(submitted)`, `last_activity_at=now`, evento `order.created`.
3. Operador vê o pedido na fila, lança no PDV, clica **"Lançado"** ⇒ `acknowledged`.
4. Todos os participantes recebem `order.created` e atualizam o consumo.

## F08 — Garçom faz pedido
1. Login → `/staff/tables` (mapa com estados).
2. Toca a mesa (BR-14): FREE ⇒ "Abrir atendimento" (sessão criada, PIN exibido); senão entra direto.
3. Mesma UI de cardápio/carrinho; mesmo endpoint de pedido; `created_by_kind=staff`.
4. Sessão `inactive` ⇒ volta a `active` (PDR-002).

## F09 — Cozinha encerrada
1. `PATCH /staff/service-areas/kitchen {is_open:false}` (BR-12) ⇒ evento `service_area.changed`.
2. Todos os clientes conectados recebem; itens de cozinha exibem "Cozinha encerrada" sem botão de adicionar; itens no carrinho ficam marcados.
3. Envio contendo item de cozinha ⇒ 422 com itens rejeitados.

## F10 — Sessão inativa por 1 h
Job (BR-08) ⇒ `inactive`, evento `session.became_inactive`. Mesa aparece como INATIVA no painel. Nada é encerrado.

## F11 — Novo cliente tenta pedir
**Caso A — device já participante:** `POST orders` em sessão `inactive` ⇒ `Order(pending_confirmation)` + `ServiceRequest(resume_session)` (BR-09). UI exibe a mensagem oficial e desabilita o envio.
**Caso B — device novo sem PIN (PDR-003):** tela de PIN mostra "Não tenho o PIN — solicitar atendimento" ⇒ `open_session` normal (F02). Operador decide como em F12/F13.

## F12 — Operador: "Encerrar sessão anterior e iniciar nova (Novo Cliente)"
`POST /staff/requests/{id}/approve {resolution: new_session}` ⇒ BR-10a. Cliente solicitante recebe novo cookie e vê novo PIN. Participantes antigos recebem `session.closed` ⇒ tela "Atendimento encerrado".

## F13 — Operador: "Continuar sessão anterior"
`POST /staff/requests/{id}/approve {resolution: continue_session}` ⇒ BR-10b. Pedido pendente vira `submitted` e entra na fila. Todos os participantes continuam válidos.

## F14 — Sessão encerrada
`POST /staff/sessions/{id}/close` (BR-13). Se há pedidos não lançados ⇒ modal "Esta mesa tem N pedidos ainda não lançados no caixa" com lista e botão "Encerrar mesmo assim" (`force=true`).

## F15 — PIN invalidado
Consequência de `closed`: `join` ⇒ "PIN inválido"; cookies de participante ⇒ 410 ⇒ tela de encerramento com resumo do consumo (SHOULD). Mesa ⇒ FREE.

## Casos de erro transversais
| Situação | Comportamento |
|---|---|
| WS cai | Reconexão exponencial; polling de fallback a cada 5 s no painel e 3 s no cliente aguardando. |
| Dois operadores agem na mesma request | Lock por mesa; segundo recebe 409 e a UI recarrega o card. |
| Cliente fecha o navegador durante espera | Ao reabrir o QR, request pendente é retomada (idempotência por device). |
| Mesa desativada com sessão viva | Bloqueado (422) — encerrar sessão primeiro. |
| Tenant bloqueado | Todas as superfícies retornam 403 com mensagem neutra. |
