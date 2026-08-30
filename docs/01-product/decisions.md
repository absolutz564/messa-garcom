# Decisões de Produto (PDR)

Data: 2026-08-29 salvo indicação. Decisões marcadas com ★ foram tomadas explicitamente pelo product owner; as demais seguem a proposta do CTO aprovada em bloco.

| ID | Tema | Decisão |
|---|---|---|
| PDR-001 | Garçom abrindo mesa livre | Abre sessão diretamente, sem aprovação do operador. Configurável por tenant fica como FUTURE. |
| PDR-002 ★ | Garçom pedindo em sessão inativa | Reativa a sessão diretamente; sem `ServiceRequest`. |
| PDR-003 | Cliente sem PIN em mesa inativa | Além do campo de PIN, existe "Não tenho o PIN — solicitar atendimento" ⇒ `open_session`. Ao aprovar, operador vê as mesmas 2 opções (nova sessão / continuar — "continuar" adiciona o dispositivo à sessão antiga). |
| PDR-004 ★ | Encerrar sessão com pedidos não lançados | Sistema bloqueia com aviso listando pedidos `submitted`; operador pode "Encerrar mesmo assim" ⇒ pedidos viram `cancelled` com motivo `session_closed_unacknowledged` (auditável). |
| PDR-005 ★ | PIN | 4 dígitos. Armazenado cifrado (não hash) para ser exibido a participantes e staff durante a sessão. Compensação: rate limit por sessão (10 falhas ⇒ PIN bloqueado 15 min + alerta ao operador) e por dispositivo (5 falhas / 10 min). |
| PDR-006 | Janelas anti-spam | 2 recusas em 15 min ⇒ bloqueio 30 min. Expiração de solicitação: 10 min (não conta). Rate limit por mesa: 5 / 10 min. |
| PDR-007 | Produtos indisponíveis | MVP: sempre visíveis com rótulo ("Indisponível" / "Cozinha encerrada"). "Ocultar" é SHOULD. |
| PDR-008 | Modificadores | Fora do MVP. Observação livre por item. Primeiro candidato pós-MVP. |
| PDR-009 | Tenant vs Restaurant | Entidade única `Tenant`. `Location` entra no futuro sem quebrar isolamento. |
| PDR-010 | Chamar garçom / pedir conta | SHOULD (fase 5 se houver fôlego). |
| PDR-011 ★ | Login do garçom | Celular pessoal. E-mail + senha uma vez; refresh token de 30 dias em PWA; admin revoga dispositivo. WebAuthn é SHOULD. |
| PDR-012 ★ (rev. 2026-08-29) | Nome do participante | **Revisado pelo product owner após o piloto interno:** o cliente pode informar um **primeiro nome/apelido opcional** (máx. 30 caracteres) para o garçom saber a quem entregar ("Caipirinha para Gabi, Mesa 1"). Sem esse dado, continua "Cliente 1/2/3". LGPD: finalidade única (entrega), visível só à equipe durante o atendimento, **apagado automaticamente ao encerrar a sessão**; declarado em `/privacidade`. Decisão original (sem nome) mantida como padrão quando o cliente não preenche. |
| PDR-013 | Encerramento automático | Regra de 1 h **não** encerra. Job diário configurável por tenant (padrão: desligado) pode encerrar sessões inativas em horário definido. SHOULD. |
| PDR-014 | Granularidade do pedido | Cada envio de carrinho = 1 `Order` ("rodada"). |
| PDR-015 ★ | Domínio do QR | `messa-garcom.com.br` (sem ç — evita Punycode, QR denso e problemas com CDNs/e-mail). Variante com ç, se registrada, apenas redireciona. URL do QR: `https://messa-garcom.com.br/t/{token}`. **Registrar antes da Fase 1.** |
