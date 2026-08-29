# LGPD e Proteção de Dados

## Inventário de dados pessoais
| Titular | Dado | Base legal | Finalidade | Retenção |
|---|---|---|---|---|
| Funcionário | nome, e-mail, hash de senha | execução de contrato (tenant) | acesso ao sistema | enquanto membership ativa + 12 meses (logs) |
| Funcionário | dispositivo (refresh token, last_seen) | legítimo interesse (segurança) | revogação de acesso | até revogação + 90 dias |
| Cliente | `device_id` pseudônimo (cookie) | legítimo interesse (anti-abuso) | anti-spam | 365 dias sem uso ⇒ apagar |
| Cliente | IP em logs | legítimo interesse (segurança) | rate limit, incidentes | 30 dias |
| Cliente | pedidos (sem identificação) | — (não identificam pessoa) | operação | por tenant; padrão 5 anos (fiscal do restaurante é do PDV, não nosso) |

**Cliente não fornece nome, telefone, e-mail, CPF nem localização no MVP (PDR-012).** Não há fingerprinting de navegador.

## Papéis LGPD
- **Messa** = operador dos dados dos clientes finais e dos funcionários (em nome do tenant), e controlador dos dados de conta do tenant.
- **Tenant** = controlador dos dados dos seus funcionários e clientes.
- Contrato de tratamento (DPA) com cada tenant: FUTURE (template antes do 10º cliente).

## Direitos dos titulares
- Funcionário: exclusão ⇒ anonimizar `users` (e-mail ⇒ hash, nome ⇒ "Usuário removido"), manter eventos por auditoria.
- Cliente: sem identificação, exclusão = apagar cookie. Endpoint `DELETE /public/device` apaga o registro `Device` (SHOULD).

## Medidas técnicas
- TLS em tudo; cookies HttpOnly/Secure.
- Logs sem PII além de IDs; IP truncado após 30 dias.
- Backups do banco cifrados (provedor); retenção 30 dias.
- Segregação por RLS.

## Pendências
- Política de privacidade pública (texto) antes do piloto.
- Aviso de cookies: cookies são estritamente necessários ⇒ sem banner de consentimento, mas com link para a política.
