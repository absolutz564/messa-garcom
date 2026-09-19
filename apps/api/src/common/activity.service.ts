import { Injectable } from '@nestjs/common';

/**
 * Última vez que alguém de fato usou o sistema.
 *
 * Existe por causa do custo do banco. O Neon cobra por **hora de compute
 * ligado**, não por consulta, e suspende depois de alguns minutos sem nenhuma
 * query. Os jobs de fundo consultavam em intervalo fixo para sempre — 500 ms o
 * publicador da outbox, 60 s o de sessões —, o que garantia que ele nunca
 * dormisse: a franquia mensal inteira era consumida por um banco ligado 24 h
 * por dia servindo, na prática, nada.
 *
 * Com este marcador, cada job pergunta antes "houve movimento?" e não encosta
 * no banco quando a casa está fechada. Nenhum deles tem o que fazer nesse
 * estado: evento de domínio só nasce de requisição, sessão só envelhece se
 * alguém a abriu, cobrança só é paga por quem está com a tela na frente.
 *
 * **Health check não conta como movimento** (ver `marcar`): ele bate a cada
 * 15 s para sempre, e contá-lo manteria a porta aberta o tempo todo — que é
 * exatamente o problema que este serviço existe para resolver.
 */
@Injectable()
export class ActivityService {
  /**
   * Começa "agora" e não em zero: no boot, os jobs precisam rodar pelo menos
   * uma vez para drenar o que ficou pendente do processo anterior.
   */
  private ultima = Date.now();

  marcar(now = Date.now()): void {
    this.ultima = now;
  }

  /** Verdadeiro quando não há movimento há mais de `ms`. */
  ocioso(ms: number, now = Date.now()): boolean {
    return now - this.ultima > ms;
  }
}

/**
 * Silêncio que faz os jobs pararem de consultar o banco.
 *
 * Dois minutos, e não vinte segundos: depois da última requisição os jobs ainda
 * precisam de uma passada para drenar a outbox e fechar o que ficou pela
 * metade. Dois minutos de folga cobrem isso com sobra e ainda deixam o banco
 * suspender — ele adormece alguns minutos depois da última query, então o ciclo
 * inteiro termina em menos de dez minutos de casa vazia.
 */
export const OCIOSO_MS = 2 * 60_000;
