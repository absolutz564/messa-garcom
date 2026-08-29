# Requisitos Não Funcionais

| ID | Área | Requisito |
|---|---|---|
| RNF-01 | Isolamento | Tenant isolation em duas camadas: aplicação (contexto de tenant em todo repositório) **e** banco (Postgres RLS). |
| RNF-02 | Autoridade | Regras críticas existem apenas no backend. Frontend é sugestão. |
| RNF-03 | Concorrência | Operações de sessão/solicitação serializadas por mesa (`SELECT … FOR UPDATE`). Conflito ⇒ HTTP 409. |
| RNF-04 | Realtime | Operador vê solicitação/pedido em ≤ 2 s; cliente vê aprovação em ≤ 2 s. Fallback por polling. |
| RNF-05 | Disponibilidade | 99,5% em horário de operação. Deploys fora de 18h–02h. |
| RNF-06 | Performance | Cardápio público < 1,5 s em 4G. Imagens ≤ 60 KB, CDN. |
| RNF-07 | Segurança | Cookies HttpOnly/Secure/SameSite; tokens opacos ≥ 64 bits de entropia; rate limits; OWASP ASVS L1. |
| RNF-08 | LGPD | Cliente não fornece dado pessoal. Device ID pseudônimo. Retenção definida em `05-security/lgpd.md`. |
| RNF-09 | Observabilidade | Logs JSON com `tenant_id`, `session_id`, `request_id`; métricas de negócio; Sentry. |
| RNF-10 | Auditoria | Toda transição de estado registra ator e timestamp (DomainEvent). |
| RNF-11 | Manutenibilidade | Monólito modular; domínio sem dependência de framework. |
| RNF-12 | Escalabilidade | API stateless; realtime desacoplado via pub/sub. |
| RNF-13 | Portabilidade | Provedores (auth, storage, realtime) atrás de interfaces. |
| RNF-14 | i18n | pt-BR; textos externalizados. |
| RNF-15 | Custo | MVP dentro de free tiers (≈ R$ 0–50/mês). |
| RNF-16 | Idempotência | `POST` de solicitações e pedidos aceitam `Idempotency-Key`. |
