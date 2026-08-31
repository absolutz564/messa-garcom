# ADR-007 — Cadastro self-service: rate limit em vez de CAPTCHA/verificação de e-mail, e-mail duplicado sempre recusa

**Status:** aceito · 2026-08-30

## Contexto
PDR-018 decide substituir o placeholder de `/` por uma landing page com cadastro self-service (RF-06), para não depender do Super Admin criar cada tenant manualmente. Isso introduz a primeira rota **pública e não autenticada que escreve dados** no sistema (`tables`/`revoked_table_tokens` já são públicas, mas só leem ou criam solicitações efêmeras) — merece uma decisão própria sobre superfície de abuso, separada do ADR-006.

## Decisão
- **Reaproveita o padrão do Terap-IA Kids, já validado em produção**: só rate limit por IP (`bucket: signup`, 10/hora, mesmo `IpRateLimitGuard` que já protege `/auth/login`). Sem CAPTCHA, sem verificação de e-mail, sem bloqueio de e-mail descartável.
- **Login automático após o cadastro.** O mesmo `AuthService.login()` do fluxo normal é chamado internamente logo após criar tenant + usuário — sem passo de confirmação, o dono do restaurante cai direto no `/admin`.
- **E-mail já cadastrado sempre recusa (`email_in_use`), nunca reaproveita a conta existente.** Esta é a única divergência deliberada do fluxo hoje operado pelo Super Admin (`platform.service.create`, RF-72), que reaproveita um usuário existente por e-mail para permitir múltiplas memberships. Reaproveitar sem verificação de e-mail é seguro quando quem opera a criação é um humano confiável que já validou a solicitação fora da banda (o Super Admin); é um vetor de abuso quando qualquer visitante anônimo pode digitar o e-mail de outra pessoa no formulário — o resultado seria anexar uma membership de admin nova à conta de um estranho, sem qualquer prova de que ele pediu isso. Como não há verificação de posse do e-mail neste fluxo (decisão acima), a única defesa é nunca tocar numa conta que já existe.
- **Slug gerado, nunca pedido.** O schema do tenant exige um `slug` único (usado hoje só para exibição/unicidade, não em URL pública), mas o formulário de cadastro não pergunta isso — geramos a partir do nome do restaurante (normaliza acentos, minúsculas, hífens) e, em colisão, anexamos um sufixo aleatório curto.
- **Sem Termos de Uso ainda** — o cadastro exige aceitar a Política de Privacidade (já existe, cobre LGPD), não um documento de Termos de Uso que precisaria de revisão jurídica antes de ir ao ar. Decisão explícita do product owner (PDR-018), não uma lacuna esquecida.

## Alternativas
- **CAPTCHA (Turnstile/hCaptcha/reCAPTCHA).** Rejeitado por ora pelo mesmo motivo que o Terap-IA Kids nunca precisou: o rate limit por IP já cobre o volume esperado no MVP, e CAPTCHA é atrito extra na primeira impressão do produto — a landing existe justamente para reduzir fricção. Fica como upgrade se o volume de spam justificar.
- **Verificação de e-mail antes de liberar acesso.** Mais seguro contra e-mails inventados, mas adiciona um passo (checar caixa de entrada) exatamente no momento em que se quer o menor atrito possível para conversão. O Terap-IA Kids roda sem isso em produção sem problema relatado; mesma aposta aqui.
- **Reaproveitar usuário existente por e-mail (igual ao fluxo do Super Admin).** Rejeitado — ver "e-mail já cadastrado" acima. É o único ponto onde o cadastro self-service é deliberadamente *mais restrito* que o fluxo administrativo, não mais permissivo.

## Consequências
+ Cadastro de fato sem fricção: 4 campos, sem espera de e-mail, sem quebra-cabeça de imagem.
+ Reaproveita infraestrutura já existente (`IpRateLimitGuard`, `AuthService.login`, criação de tenant), sem nova superfície de segurança para manter.
− Sem verificação de e-mail, é possível cadastrar um tenant com um e-mail que a pessoa não controla (mas nesse caso ela também nunca vai receber a senha nem conseguir logar de novo se perder o token de acesso — o dano fica contido a "um tenant órfão existe", não a acesso indevido a dados de terceiros).
− Sem CAPTCHA, um script poderia gerar tenants em massa até o limite de 10/hora por IP; aceitável no volume do MVP, revisitar se virar problema real.
