# Requisitos Funcionais

Prioridade: **M** must · **S** should · **F** future.

## Plataforma / Multi-tenancy
| ID | Requisito | Prio |
|---|---|---|
| RF-01 | Cada restaurante é um tenant isolado; nenhuma consulta pode cruzar tenants. | M |
| RF-02 | Toda entidade operacional carrega `tenant_id`. | M |
| RF-03 | Super Admin cria, bloqueia/desbloqueia e lista tenants. | M |
| RF-04 | Super Admin vê métricas globais. | S |
| RF-05 | Planos/assinaturas/cobrança do tenant (entregue 2026-08-30, BR-20/PDR-017): trial 14 dias, planos Mensal/Semestral/Anual, Pix via Mercado Pago com confirmação automática. Pagamento da conta *pelo cliente* (RF-69) segue F. | M |
| RF-06 | Cadastro self-service (entregue 2026-08-30, BR-21/PDR-018): landing page pública com "Testar grátis"; dono do restaurante cria a própria conta sem depender do Super Admin. Login automático após o cadastro; trial de 14 dias (RF-05) começa imediatamente. | M |

## Configuração do restaurante
| ID | Requisito | Prio |
|---|---|---|
| RF-10 | Admin configura nome, logo, cor primária. | M |
| RF-11 | CRUD de categorias com ordenação. | M |
| RF-12 | CRUD de produtos: nome, **descrição opcional**, preço, foto, disponibilidade, categoria. | M |
| RF-13 | Produto pertence a uma área de serviço (`kitchen` ou `bar`). | M |
| RF-14 | Cardápio público com identidade do restaurante e nome da mesa. | M |
| RF-15 | Descrição, quando existir, é exibida junto ao produto. | M |
| RF-16 | Admin/operador abre/fecha áreas de serviço; produtos da área fechada não aceitam novos pedidos. | M |
| RF-17 | Configuração: produtos indisponíveis visíveis com rótulo vs ocultos (MVP: sempre visíveis com rótulo). | S |
| RF-18 | Modificadores/opcionais de produto. | F |
| RF-19 | Observação livre por item do pedido. | M |

## Mesas e QR
| ID | Requisito | Prio |
|---|---|---|
| RF-20 | Admin cria/edita/ativa/desativa mesas com identificação livre. | M |
| RF-21 | Cada mesa possui `public_token` único, opaco, permanente, desacoplado do nome. | M |
| RF-22 | Renomear mesa não invalida o QR. | M |
| RF-23 | Gerar e baixar QR (PNG/SVG) individual. | M |
| RF-24 | Download em lote (PDF). | S |
| RF-25 | Rotacionar token (novo QR, antigo revogado com mensagem clara). | S |

## Solicitação e sessão
| ID | Requisito | Prio |
|---|---|---|
| RF-30 | Mesa livre: cliente vê cardápio (somente leitura) + "Iniciar atendimento". | M |
| RF-31 | Solicitação não cria sessão; vai para a fila do operador. | M |
| RF-32 | Operador aprova ou recusa em tempo real. | M |
| RF-33 | Aprovação cria sessão, gera PIN, vincula o dispositivo solicitante. | M |
| RF-34 | Mesa ocupada: dispositivo novo informa PIN para entrar. | M |
| RF-35 | PIN pertence à sessão; sessão encerrada ⇒ PIN inválido. | M |
| RF-36 | Vários dispositivos na mesma sessão. | M |
| RF-37 | Operador encerra sessão manualmente (com aviso se houver pedidos não lançados — PDR-004). | M |
| RF-38 | Garçom abre mesa livre sem aprovação (PDR-001) e acessa sessão ativa sem PIN. | M |
| RF-39 | PIN visível a participantes e staff durante a sessão (PDR-005). | M |
| RF-3A | Mesa inativa: dispositivo sem PIN pode "solicitar atendimento" (PDR-003). | M |
| RF-83 | Equipe sem conexão: cliente é impedido de iniciar atendimento/retomar sessão e orientado a chamar um garçom; painel de staff mostra estado de conexão explícito (BR-19, PDR-016). | M |

## Anti-spam
| ID | Requisito | Prio |
|---|---|---|
| RF-40 | Uma única solicitação pendente por (mesa, dispositivo). | M |
| RF-41 | Recusas são registradas. | M |
| RF-42 | 2 recusas do mesmo dispositivo para a mesma mesa em 15 min ⇒ bloqueio de 30 min (PDR-006). | M |
| RF-43 | Identificador de dispositivo anônimo, persistente, emitido pelo backend; não depende só de IP. | M |
| RF-44 | Bloqueado recebe mensagem adequada; operador não é notificado. | M |
| RF-45 | Rate limit por mesa: 5 solicitações / 10 min de qualquer origem. | M |
| RF-46 | Solicitação sem resposta expira em 10 min (não conta para bloqueio). | M |

## Inatividade (1h)
| ID | Requisito | Prio |
|---|---|---|
| RF-50 | Sessão sem pedido há ≥ 1h ⇒ `inactive` (não encerrada). | M |
| RF-51 | Pedido de **cliente** em sessão inativa fica em espera e gera solicitação `resume_session`. | M |
| RF-52 | Operador escolhe "Encerrar anterior e iniciar nova" ou "Continuar sessão anterior". | M |
| RF-53 | Enquanto aguarda, o cliente não reenvia nem duplica solicitação. | M |
| RF-54 | "Nova": anterior encerrada (comanda preservada), nova sessão + novo PIN, pedido pendente migra. | M |
| RF-55 | "Continuar": pedido confirmado na sessão original; sessão volta a `active`. | M |
| RF-56 | Pedido de **garçom** em sessão inativa reativa direto (PDR-002). | M |

## Pedidos
| ID | Requisito | Prio |
|---|---|---|
| RF-60 | Carrinho por dispositivo; cada envio cria um `Order` (PDR-014). | M |
| RF-61 | Pedido registra quem criou (participante ou funcionário). | M |
| RF-62 | Nome e preço congelados no item no momento do pedido. | M |
| RF-63 | Backend valida disponibilidade e área de serviço no envio. | M |
| RF-64 | Operador vê pedidos em tempo real e marca "Lançado no caixa". | M |
| RF-65 | Operador cancela pedido com motivo. | M |
| RF-66 | Participantes veem consumo consolidado da mesa. | M |
| RF-67 | Cliente cancela o próprio pedido enquanto não lançado. | S |
| RF-68 | "Pedir a conta" (entregue 2026-08-29, BR-18). "Chamar garçom" segue SHOULD. | M |
| RF-69 | Pagamento, divisão de conta. | F |

## Usuários e acesso
| ID | Requisito | Prio |
|---|---|---|
| RF-70 | Admin convida funcionários por e-mail e atribui papel. | M |
| RF-71 | Papéis: Super Admin, Restaurant Admin, Operator, Waiter, Customer (anônimo). | M |
| RF-72 | Usuário pode ter papel em mais de um tenant. | S (modelo suporta desde o MVP) |
| RF-73 | Login de funcionário com e-mail + senha. | M |
| RF-74 | Garçom no celular pessoal: sessão longa em PWA, revogável pelo admin (PDR-011). | M |

## Integrações
| ID | Requisito | Prio |
|---|---|---|
| RF-80 | Eventos de domínio na outbox. | M |
| RF-81 | Webhooks por tenant. | F |
| RF-82 | Adapters de PDV. | F |
