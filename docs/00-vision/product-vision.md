# Visão do Produto

## O que é
Messa é um SaaS B2B multi-tenant para bares e restaurantes que adiciona uma camada de **entrada de pedidos** entre o cliente e o caixa.

- O cliente escaneia um QR Code permanente na mesa, solicita atendimento, é liberado pelo caixa, entra numa **sessão** protegida por PIN e faz pedidos pelo celular.
- O garçom, autenticado, usa o **mesmo** motor de pedidos e a **mesma** sessão para atender quem prefere atendimento humano.
- O operador/caixa vê solicitações e pedidos em tempo real e os lança no sistema que o restaurante já usa.

## O que NÃO é
- Não é PDV / sistema de caixa.
- Não é KDS / sistema de cozinha.
- Não processa pagamento (no MVP).
- Não substitui o garçom: trabalha junto com ele.

## Tese central do domínio
> **O QR identifica a mesa. A sessão é o contrato de atendimento. O operador é a autoridade em toda situação ambígua.**

Tudo deriva daí: aprovação de solicitações, PIN, regra de 1 hora, anti-spam.

## Princípios (imutáveis sem PDR)
1. Segurança da sessão da mesa é prioridade.
2. Nunca misturar a comanda de dois clientes diferentes.
3. O operador é a autoridade para iniciar/validar situações ambíguas.
4. QR Code identifica a mesa, mas não concede automaticamente acesso a uma sessão.
5. PIN autoriza a entrada de clientes na sessão.
6. QR Code é permanente; sessão é temporária.
7. Cliente e garçom usam o mesmo domínio de pedidos.
8. Multi-tenancy desde o início.
9. Não construir cozinha/PDV no MVP.
10. Não criar complexidade sem necessidade.
11. Simples para o restaurante configurar.
12. Extremamente simples para o cliente usar.
13. Backend é a autoridade para regras críticas.
14. Escalabilidade, segurança, observabilidade e manutenção desde o início.
15. LGPD e proteção de dados desde a arquitetura.

## Métrica de sucesso do MVP
- % de pedidos da casa que entram via Messa (cliente + garçom) vs. papel.
- Tempo médio entre "solicitação" e "liberação" pelo caixa.
- Número de sessões/dia por restaurante piloto.
