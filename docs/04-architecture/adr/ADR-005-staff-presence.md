# ADR-005 — Presença da equipe derivada dos sockets, fora da outbox

**Status:** aceito · 2026-08-30

## Contexto
A topologia é 100% nuvem (PDR-015): nada roda no restaurante. Quando a internet do restaurante cai, o cliente no 4G continua alcançando a API e o pedido é gravado corretamente — mas ninguém vê. Para BR-19 o cliente precisa saber, em tempo real, se existe alguém da equipe conectado.

## Decisão
- **Sinal:** número de sockets de staff na room `tenant:{id}`, que o gateway do ADR-003 já mantém. Nada de coluna nova nem escrita periódica no banco.
- **Carência:** quando o último socket cai, o tenant só vira offline após 45 s. Um F5 no painel derruba e reconecta o socket em ~1 s e não pode aparecer como queda. A volta para online é imediata.
- **Distribuição:** mensagem de socket `presence` (não `event`) para a room `tenant-sessions:{tenantId}`, que já contém todos os clientes do tenant. Complementada por `GET /public/tables/:token/presence` para polling (20 s) e para o cliente que ainda não tem cookie de dispositivo e portanto não tem socket.
- **Presença não é evento de domínio.** Não passa pela outbox, não entra em `domain_events` e não aparece em `EVENT_TYPES`. É estado de transporte, efêmero e derivado; persistir seria mentir sobre o significado de BR-17 ("toda transição grava DomainEvent").
- **Autoridade no backend (RNF-02):** `open_session` e `resume_session` são recusados com 409 `staff_offline` no serviço. O frontend só antecipa o bloqueio.

## Alternativas
- **Coluna `staff_last_seen_at` em `tenants`, escrita a cada request de staff.** Mais robusta contra socket-zumbi, mas custa escrita a cada 5 s por tenant e uma migration, para um ganho que o ping/pong do Socket.IO (~45 s) já cobre. Fica como upgrade se o piloto mostrar falso-offline.
- **`navigator.onLine` no cliente.** Não serve: o celular do cliente está online; quem caiu é o restaurante.

## Consequências
+ Zero mudança de schema, zero carga extra no banco, usa o que o ADR-003 já entrega.
+ O sinal é tenant-wide: o celular de um garçom no 4G mantém o restaurante "online", que é o comportamento correto.
− Estado em memória do processo. Aceitável porque é derivado: se o processo reinicia, todos os sockets caem junto e o estado se reconstrói em segundos. **Ao escalar para > 1 instância é preciso o Redis adapter** — `fetchSockets()` já é adapter-aware, mas a contagem local não é; ver ADR-003.
− Socket zumbi (aba suspensa que ainda responde ping) pode manter "online" por até ~45 s depois da queda real.
