# Onboarding de um restaurante (piloto)

Tempo estimado: 30–45 min presenciais. Leve QR Codes já impressos se as mesas foram cadastradas antes.

## Antes da visita (você, no `/platform`)
1. Criar o restaurante (nome, slug, e-mail e senha inicial do dono).
2. Enviar ao dono: link `https://messa-garcom.com.br/staff/login`, e-mail e senha inicial.

## Na visita (com o dono, no `/admin`)
1. **Restaurante**: nome como aparece para o cliente, cor principal, logo (foto do letreiro serve).
2. **Cardápio**: categorias na ordem do cardápio físico; produtos com preço e, quando ajuda a vender, descrição e foto. Marcar corretamente **Cozinha** × **Bar** — é isso que o botão "Encerrar cozinha" usa.
3. **Mesas**: cadastrar com o nome que já está na mesa física ("Mesa 12", "Varanda 3"). Baixar os QR em PNG, imprimir (adesivo ou display de acrílico), colar. Renomear a mesa depois **não** invalida o QR.
4. **Equipe**: convidar o caixa (papel *Operador*) e os garçons (*Garçom*). Cada um recebe e-mail; no celular, abrir o link, criar senha e **adicionar à tela inicial** (PWA).

## Treinamento (10 min)
**Caixa** — abrir `/staff` num tablet/PC fixo e deixar aberto:
- Card amarelo piscando = cliente pediu atendimento → **LIBERAR** ou **RECUSAR**.
- Card "Pedidos a lançar" = pedido novo → lançar no PDV e clicar **Lançado no caixa**.
- Mesa vermelha "Inativa" = mais de 1 h sem pedidos; se alguém pedir, o sistema pergunta: **Novo cliente** (fecha a comanda antiga) ou **Continuar** (mesma comanda). Na dúvida, olhar a mesa.
- Fim da noite: **Encerrar atendimento** em cada mesa após o pagamento. Às 22h (ou quando for): **Encerrar cozinha**.

**Garçom** — no celular:
- Tocar na mesa → **Abrir atendimento** (para quem prefere ser atendido) ou entrar na sessão existente.
- **Fazer pedido para esta mesa** → montar e enviar. Vai para a mesma fila do caixa.
- O PIN aparece na tela: informe ao cliente se ele quiser pedir pelo próprio celular.

**Cliente** (explicar ao caixa para orientar):
- Escaneia → cardápio → "Iniciar atendimento" → aguarda o caixa liberar → vê o PIN → pede.
- Outras pessoas da mesa escaneiam e digitam o PIN.

## O que o Messa NÃO faz (alinhar expectativas)
- Não envia para a cozinha nem imprime; o caixa lança no sistema que já usa.
- Não cobra nem fecha a conta.
- Não substitui o garçom — trabalha junto.

## Após 1 semana
Perguntar: % de pedidos que vieram pelo Messa, tempo médio para liberar, reclamações de clientes, pedidos "perdidos" (não lançados). Isso alimenta a métrica de sucesso (`00-vision/product-vision.md`).
