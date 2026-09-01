'use client';

import { useEffect } from 'react';
import { capturar } from '@messa/origem/dist/capture';

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
      capturar({ internalHosts: [window.location.host] });
    } catch {
      // Medir de onde veio a visita nunca pode quebrar a página que ela veio ver.
    }
  }, []);

  return null;
}
