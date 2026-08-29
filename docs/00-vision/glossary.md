# Glossário

| Termo | Definição |
|---|---|
| **Tenant** | Um restaurante/bar cliente do SaaS. Unidade de isolamento de dados. No MVP, 1 tenant = 1 estabelecimento. |
| **Membership** | Vínculo usuário × tenant × papel (admin, operator, waiter). |
| **Mesa (Table)** | Ponto físico de atendimento com identificação livre ("Mesa 38", "VIP 01", "Varanda 03"). |
| **Public token** | Identificador opaco e permanente da mesa, embutido no QR Code. Desacoplado do nome. |
| **Sessão (Session)** | Contrato de atendimento de uma mesa: começa quando liberada, agrupa participantes e pedidos, termina quando encerrada. Equivale à "comanda". |
| **PIN** | Código de 4 dígitos que pertence à sessão e autoriza novos dispositivos a entrarem nela. |
| **Dispositivo (Device)** | Pseudônimo anônimo e persistente do navegador do cliente, emitido pelo backend via cookie. Base do anti-spam. |
| **Participante (SessionParticipant)** | Vínculo entre um dispositivo e uma sessão. |
| **Solicitação (ServiceRequest)** | Pedido de decisão ao operador: abrir sessão (`open_session`) ou retomar sessão inativa (`resume_session`). |
| **Operador / Caixa** | Funcionário que aprova solicitações, acompanha pedidos, lança no PDV e encerra sessões. |
| **Garçom (Waiter)** | Funcionário que abre/acessa mesas e registra pedidos em nome do cliente. |
| **Área de serviço (ServiceArea)** | Agrupamento de produtos com horário próprio (`kitchen`, `bar`). Pode ser fechada independentemente. |
| **Pedido (Order)** | Uma "rodada": o conteúdo de um envio de carrinho, dentro de uma sessão. |
| **Acknowledged / Lançado** | Estado do pedido após o operador registrá-lo no sistema de caixa do restaurante. Ponto de handoff. |
| **Sessão inativa** | Sessão sem pedidos há ≥ 1 hora. Não está encerrada; exige confirmação do operador para novos pedidos de clientes. |
| **Outbox / DomainEvent** | Registro de eventos de domínio para auditoria e integrações futuras. |
