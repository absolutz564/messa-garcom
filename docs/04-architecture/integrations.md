# Integrações (arquitetura futura, base no MVP)

## Objetivo
Permitir integração com PDVs (webhooks, adapters específicos) **sem contaminar o core**.

## Padrão: Ports & Adapters sobre a outbox
```
domínio ──commit──▶ domain_events (outbox)
                         │
                   EventPublisher (após commit)
                    ├──▶ RealtimeGateway (Socket.IO)      ← MVP
                    └──▶ IntegrationDispatcher            ← MVP: vazio
                            ├──▶ WebhookAdapter (por tenant)      FUTURE
                            ├──▶ Adapter PDV X                     FUTURE
                            └──▶ ...
```
- `IntegrationAdapter` interface: `supports(tenant, eventType)`, `deliver(event)`.
- Entrega com retry e dead-letter via BullMQ quando existir (não no MVP).
- O core nunca importa adapters; o dispatcher os descobre por configuração do tenant.

## Eventos relevantes para PDV
`order.created`, `order.acknowledged`, `order.cancelled`, `session.opened`, `session.closed`.
Catálogo completo em `07-api/events.md`.

## Sentido inverso (PDV → Messa)
Fora do escopo. Se surgir (ex.: PDV fecha a conta e quer encerrar a sessão), entra como endpoint autenticado por API key de tenant chamando o mesmo serviço de domínio (`SessionService.close`).
