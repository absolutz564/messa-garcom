import { ActivityService, OCIOSO_MS } from './activity.service';

/*
 * O que estes testes protegem é uma conta de dinheiro: o Neon cobra por hora de
 * compute ligado, e o banco só suspende depois de alguns minutos sem query
 * nenhuma. Se a porta ficar aberta sozinha, os jobs voltam a consultar para
 * sempre e a franquia mensal é consumida por um banco servindo nada.
 */
describe('ActivityService (BR-25)', () => {
  it('no boot não está ocioso — os jobs precisam de uma passada para drenar o que ficou', () => {
    const a = new ActivityService();
    expect(a.ocioso(OCIOSO_MS)).toBe(false);
  });

  it('fica ocioso depois da folga, e uma requisição reabre', () => {
    const a = new ActivityService();
    const t0 = 1_000_000;
    a.marcar(t0);

    expect(a.ocioso(OCIOSO_MS, t0 + OCIOSO_MS)).toBe(false);
    expect(a.ocioso(OCIOSO_MS, t0 + OCIOSO_MS + 1)).toBe(true);

    a.marcar(t0 + OCIOSO_MS + 2);
    expect(a.ocioso(OCIOSO_MS, t0 + OCIOSO_MS + 2)).toBe(false);
  });

  it('a folga cabe entre a última requisição e o sono do banco', () => {
    // Dois minutos de jobs + os ~5 min que o Neon espera para suspender: a casa
    // vazia leva menos de dez minutos para o banco desligar. Se esta folga
    // crescer demais, o banco nunca chega a dormir.
    expect(OCIOSO_MS).toBeLessThanOrEqual(5 * 60_000);
  });
});
