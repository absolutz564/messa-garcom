# Escopo do MVP

## MUST HAVE
1. Multi-tenant com RLS + Super Admin básico.
2. Admin: branding mínimo, categorias, produtos (descrição opcional, foto, área de serviço), mesas, QR.
3. Cardápio público com branding.
4. Solicitação → aprovação/recusa → sessão + PIN.
5. Entrada por PIN de múltiplos dispositivos.
6. Anti-spam (dispositivo + mesa) com bloqueio temporário.
7. Pedidos (carrinho, observação por item, snapshot de preço, validações).
8. Painel do operador: mapa de mesas, fila de solicitações, fila de pedidos, ack, encerrar sessão, toggle de áreas.
9. Regra de 1 h com as duas opções do operador + "não tenho o PIN".
10. Garçom: login, mesas, abrir/acessar sessão, pedir, ver consumo.
11. Realtime.
12. Convite de funcionários e RBAC.
13. Outbox de eventos.

## SHOULD HAVE
- QR em lote (PDF)
- Ocultar produtos indisponíveis (configuração)
- Chamar garçom / pedir a conta
- Cliente cancela pedido antes do ack
- Rotação de token de QR
- WebAuthn para garçom
- Métricas do Super Admin
- Encerramento automático diário configurável (PDR-013)

## FUTURE
- Pagamento / split / gorjeta
- Modificadores de produto
- KDS / impressão
- Integração PDV (webhooks / adapters)
- Billing / planos
- Multi-idioma para cliente
- Relatórios / BI
- App nativo
- Fidelidade / cadastro de cliente
- `Location` (redes com várias unidades)
