/**
 * Sessão da área de afiliados (BR-24) — separada da sessão de staff, de propósito.
 *
 * Cookie próprio e **emissor próprio** no token. O emissor é a parte que importa:
 * `JwtModule` verifica `issuer: 'messa'`, então um token de afiliado apresentado
 * como `Authorization: Bearer` é recusado pela própria biblioteca, antes de virar
 * um `principal` sem `userId` que os guards teriam de rejeitar por acidente. E um
 * token de staff é recusado aqui pelo mesmo mecanismo, na direção contrária.
 *
 * Reaproveitar o token de staff economizaria este arquivo e criaria exatamente a
 * confusão que ele evita: uma credencial compartilhada por divulgadores externos
 * não pode ter caminho nenhum até o painel onde ficam mesas, pedidos e faturamento.
 */
export const AFILIADO_COOKIE = 'messa_afiliado';

/** 12 h: uma jornada de conferência, sem obrigar login a cada visita. */
export const AFILIADO_TTL_SEGUNDOS = 12 * 60 * 60;

export const AFILIADO_ISSUER = 'messa-afiliado';

/** Credencial única, compartilhada pelos divulgadores. */
export const AFILIADO_USUARIO = 'afiliados';

export interface TokenDeAfiliado {
  purpose: 'afiliado';
}

/**
 * Hash argon2 da senha, aceito cru ou em base64.
 *
 * Hash argon2 começa com cifrão, e carregador de `.env` que expande referências a
 * variáveis entrega o valor mutilado — sem um único cifrão e com metade do
 * tamanho. Pior que quebrar: em produção a variável vem da plataforma, onde não há
 * expansão, então o mesmo valor se comporta de um jeito local e de outro
 * publicado. Base64 não tem cifrão e atravessa os dois caminhos igual.
 *
 * O formato cru continua aceito: quem colar o hash direto no Fly — onde ele de
 * fato funciona — não merece descobrir isso por um login que falha sem dizer por quê.
 */
export function hashDaSenhaDeAfiliado(bruto: string | undefined): string | null {
  const valor = bruto?.trim();
  if (!valor) return null;
  if (valor.startsWith('$')) return valor;
  try {
    const decodificado = Buffer.from(valor, 'base64').toString('utf8');
    return decodificado.startsWith('$') ? decodificado : null;
  } catch {
    return null;
  }
}
