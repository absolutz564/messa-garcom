# Deploy — Piloto

Topologia aprovada (PDR-015, ADR-003): **Vercel** (web) + **Fly.io** (API, processo persistente) + **Neon** (Postgres) + **Resend** (e-mail). Custo esperado: US$ 2–5/mês.

```
messa-garcom.com.br        → Vercel   (apps/web)
api.messa-garcom.com.br    → Fly.io   (apps/api, 1 máquina sempre ligada, volume /data)
                              Neon    (Postgres, branch main)
```

Tudo abaixo roda uma vez. Comandos a partir da raiz do repositório.

## 0. Pré-requisitos
- Contas: [fly.io](https://fly.io), [vercel.com](https://vercel.com), [neon.tech](https://neon.tech), [resend.com](https://resend.com), GitHub.
- CLIs: `flyctl` (já instalado), `vercel` (`npm i -g vercel`, opcional — dá para fazer pelo site).
- Repositório no GitHub (`git commit` + `git push`).

## 1. Banco — Neon
1. Criar projeto `messa` (região `aws-sa-east-1` São Paulo), Postgres 16.
2. Em *Settings → Compute*, aumentar **Suspend compute after inactivity** para o máximo do plano (evita cold start no horário do bar). Se ainda incomodar, trocar por Supabase.
3. Copiar a connection string **pooled** (`...-pooler...neon.tech/messa?sslmode=require`). Ela vira `DATABASE_URL` **e** `DATABASE_MIGRATOR_URL` (role única; `FORCE ROW LEVEL SECURITY` garante o isolamento mesmo para o owner — ADR-002).
4. **Não** rode `pnpm db:seed` em produção. O primeiro super admin é criado no passo 3.6.

## 2. E-mail — Resend
1. Adicionar o domínio `messa-garcom.com.br`, criar os registros DNS (SPF/DKIM) que o Resend mostrar.
2. Criar API key → `RESEND_API_KEY`. Remetente: `Messa <no-reply@messa-garcom.com.br>`.
   Sem a chave, o sistema continua funcionando: o link de convite aparece na tela do admin.

## 3. API — Fly.io
```bash
fly auth login
fly apps create messa-api                      # nome já está no fly.toml
fly volumes create messa_data --region gru --size 1 --app messa-api   # uploads (logo/fotos)

# Segredos (gere valores reais; nunca reutilize os de dev)
fly secrets set --app messa-api \
  DATABASE_URL='postgres://...neon.tech/messa?sslmode=require' \
  DATABASE_MIGRATOR_URL='postgres://...neon.tech/messa?sslmode=require' \
  JWT_SECRET="$(openssl rand -base64 48)" \
  COOKIE_SECRET="$(openssl rand -base64 48)" \
  PIN_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  RESEND_API_KEY='re_...'

fly deploy                                     # build remoto; release_command roda as migrations
fly certs add api.messa-garcom.com.br --app messa-api   # mostra os registros DNS (passo 5)
fly status --app messa-api                     # 1 máquina "started"; nunca "suspended"
curl https://api.messa-garcom.com.br/ready     # {"status":"ok","db":"ok"}
```
5. **Nunca** habilite `auto_stop_machines` nem `min_machines_running = 0` — WebSocket e o job de 1 h dependem do processo vivo (ver incidente comparador-fichas em `environments.md`).
6. Criar o super admin (uma vez), com o console do Fly:
```bash
fly ssh console --app messa-api -C "node -e \"
const {hash}=require('@node-rs/argon2');const postgres=require('postgres');
(async()=>{const sql=postgres(process.env.DATABASE_URL,{max:1});
const h=await hash(process.argv[1]);
await sql\\\`insert into users (id,email,name,password_hash,is_platform_admin) values (gen_random_uuid(),'SEU_EMAIL','Seu Nome',\\\${h},true)\\\`;
await sql.end();console.log('ok')})()\" 'SUA_SENHA_FORTE'"
```
   Depois: `https://messa-garcom.com.br/staff/login` → o sistema exige ativar o **2FA** (app autenticador) → `/platform` → criar o primeiro restaurante.
   Perdeu o autenticador? Reset manual: `update users set totp_enabled_at = null, totp_secret_encrypted = null where email = '...'`.

## 4. Web — Vercel
1. *New Project* → importar o repositório. **Root Directory: `apps/web`** (o `vercel.json` já configura install/build do monorepo).
2. Environment variables (Production):
   - `NEXT_PUBLIC_API_URL=https://api.messa-garcom.com.br`
   - `API_INTERNAL_URL=https://api.messa-garcom.com.br`
3. Deploy. Em *Domains*, adicionar `messa-garcom.com.br` e `www.messa-garcom.com.br` (redirect para o apex).

## 5. DNS (registro.br)
| Tipo | Nome | Valor |
|---|---|---|
| A | `@` | IP que a Vercel indicar (`76.76.21.21`) |
| CNAME | `www` | `cname.vercel-dns.com` |
| A / AAAA | `api` | IPv4/IPv6 que `fly certs add` indicar |
| TXT/CNAME | (Resend) | SPF/DKIM indicados pelo Resend |

Cookies: web e API estão no mesmo *site* (`messa-garcom.com.br`), então `SameSite=Lax` funciona para o refresh e para os cookies do cliente.

## 6. Monitoramento (obrigatório — RNF-05)
- [Better Stack](https://betterstack.com) ou [UptimeRobot](https://uptimerobot.com) (free): monitor HTTP em `https://api.messa-garcom.com.br/ready` a cada 1 min, alerta por e-mail/WhatsApp. Segundo monitor em `https://messa-garcom.com.br/`.
- Sentry (free): `SENTRY_DSN` — instrumentação entra quando o piloto começar a gerar erros reais.
- `fly logs --app messa-api` para logs JSON ao vivo.

## 7. Deploys seguintes
- API: `git tag v0.1.0 && git push --tags` → workflow `deploy-api.yml` roda `fly deploy` (precisa do secret `FLY_API_TOKEN` no GitHub: `fly tokens create deploy -x 999999h`). Ou manualmente: `fly deploy`.
- Web: cada push em `main` faz deploy na Vercel (preview em PRs).
- Janela: **fora de 18h–02h**. Migrations sempre *expand/contract* (a versão antiga roda por alguns segundos durante o rolling deploy).

## 8. Checklist antes do primeiro restaurante real
- [ ] `fly status` mostra 1 máquina `started`, health check verde
- [ ] `/ready` monitorado externamente com alerta
- [ ] QR de teste impresso e lido em Android e iPhone (URL `https://messa-garcom.com.br/t/…`)
- [ ] Fluxo completo em produção: solicitar → liberar → PIN em 2 celulares → pedido → lançado → encerrar
- [ ] 2FA do super admin (pendência do threat model)
- [ ] Política de privacidade publicada e linkada no cardápio
- [ ] Backup: Neon mantém 7 dias de histórico (free). Anotar o procedimento de restore.
