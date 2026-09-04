# Messa — Garçom Virtual · Documentação

> Um garçom virtual que trabalha junto com a equipe do restaurante.

| Pasta | Conteúdo |
|---|---|
| [00-vision](00-vision/) | Tese do produto, princípios, glossário |
| [01-product](01-product/) | Requisitos funcionais / não funcionais, escopo do MVP, decisões de produto (PDR) |
| [02-domain](02-domain/) | Modelo de domínio, máquinas de estado, regras de negócio ("constituição") |
| [03-flows](03-flows/) | Fluxos ponta a ponta (F01–F15) |
| [04-architecture](04-architecture/) | Visão da arquitetura, ADRs, multi-tenancy, realtime, integrações, escala |
| [05-security](05-security/) | Autenticação, threat model, LGPD |
| [06-database](06-database/) | Schema, índices, RLS |
| [07-api](07-api/) | Catálogo de eventos, WebSocket, OpenAPI (gerado) |
| [08-operations](08-operations/) | Ambientes, runbook, observabilidade |
| [09-ux](09-ux/) | Inventário de telas, textos oficiais |
| [10-comercial](10-comercial/) | Briefing do produto para divulgação (fatos para colar em IA) |

## Como ler
1. Comece por `00-vision/product-vision.md`.
2. `02-domain/business-rules.md` é a fonte de verdade das regras críticas. Código que contradiga esse arquivo está errado — ou o arquivo precisa de uma PDR nova.
3. Toda decisão relevante vira uma **PDR** (produto) ou **ADR** (arquitetura). Não altere regra sem registrar.

## Convenções
- IDs de requisito: `RF-xx`, `RNF-xx`. Fluxos: `Fxx`. Decisões: `PDR-xxx`, `ADR-xxx`.
- Idioma da documentação: pt-BR. Idioma do código e identificadores: inglês.
