'use client';

import { useEffect } from 'react';
import { capturar } from '@messa/origem/dist/capture';
import { visitaParaContar } from '@messa/origem/dist/visit';
// Módulo direto, e não o barril `@messa/domain`: ele reexporta `tokens.ts`, que
// importa `node:crypto` — no bundle do navegador isso quebra o build inteiro.
import { attributionCookieDomain } from '@messa/domain/dist/attribution';
import { API_URL } from '@/lib/api';

/**
 * Captura a origem da visita (RF-07/BR-23).
 *
 * Só no navegador, e só nas páginas de aquisição: `document.referrer` não existe
 * no servidor, e o cabeçalho `Referer` é omitido por boa parte dos navegadores
 * justamente na navegação entre sites — que é o caso que interessa medir.
 *
 * Fica fora do cardápio do cliente (`/t/[token]`) de propósito: ali quem escaneia
 * é o cliente do restaurante, não um restaurante em potencial. Guardar cookie de
 * campanha no celular dele seria coletar dado sem finalidade.
 *
 * Nada de identificador pessoal entra no cookie: apenas a campanha que trouxe a
 * pessoa, o caminho de entrada sem query string e o host de quem indicou.
 */
export function OrigemTracker() {
  useEffect(() => {
    try {
      const captura = capturar({
        internalHosts: [window.location.host],
        // Sem isto o cookie é host-only e não acompanha o cadastro até a API,
        // que vive noutro subdomínio: a origem chegava vazia e todo cadastro
        // era gravado como "direto" (BR-23).
        cookieDomain: attributionCookieDomain(window.location.hostname, new URL(API_URL).hostname),
      });

      // Conta a visita uma vez por navegador novo, e nunca a direta — a regra
      // é da biblioteca; aqui só se envia o que ela decidiu gravar.
      const visita = visitaParaContar(captura);
      if (visita) {
        // `keepalive`: a pessoa pode clicar em algo antes de a requisição
        // terminar. Sem isso o navegador cancela, e some justamente a visita de
        // quem chegou e navegou rápido — o visitante mais interessado.
        void fetch(`${API_URL}/public/origem/visita`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          keepalive: true,
          body: JSON.stringify(visita),
        }).catch(() => {
          // A atribuição já está no cookie; perder a contagem não muda o cadastro.
        });
      }
    } catch {
      // Medir de onde veio a visita nunca pode quebrar a página que ela veio ver.
    }
  }, []);

  return null;
}
