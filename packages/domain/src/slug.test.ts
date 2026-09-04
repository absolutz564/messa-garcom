import { describe, expect, it } from 'vitest';
import { campaignShortCode, slugify, slugWithSuffix } from './slug';

describe('slugify (BR-21)', () => {
  it('normaliza nome comum de restaurante', () => {
    expect(slugify('Bar do João')).toBe('bar-do-joao');
  });

  it('remove acentos e cedilha', () => {
    expect(slugify('Refeições & Cia')).toBe('refeicoes-cia');
  });

  it('colapsa separadores e apara as pontas', () => {
    expect(slugify('  --Pizzaria   Bella!!  ')).toBe('pizzaria-bella');
  });

  it('trunca em 40 caracteres sem deixar hífen solto no fim', () => {
    const s = slugify('Restaurante Muito Grande Do Seu Zé Com Nome Enorme');
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith('-')).toBe(false);
  });

  it('nome só com símbolos ⇒ fallback (o schema exige slug não-vazio)', () => {
    expect(slugify('!!! ###')).toBe('restaurante');
    expect(slugify('')).toBe('restaurante');
  });

  it('nome em outro alfabeto ⇒ fallback em vez de slug vazio', () => {
    expect(slugify('居酒屋')).toBe('restaurante');
  });
});

describe('slugWithSuffix (BR-21)', () => {
  it('anexa sufixo de 4 dígitos para resolver colisão', () => {
    expect(slugWithSuffix('bar-do-joao', () => 234)).toBe('bar-do-joao-1234');
  });

  it('sufixo fica sempre em 4 dígitos (nunca colide com o formato do slug base)', () => {
    expect(slugWithSuffix('x', () => 0)).toBe('x-1000');
    expect(slugWithSuffix('x', () => 8999)).toBe('x-9999');
  });
});

describe('campaignShortCode (BR-23)', () => {
  it('nasce da origem, em minúsculas e sem acento', () => {
    expect(campaignShortCode('Instagram')).toBe('instagram');
    expect(campaignShortCode('Indicação')).toBe('indicacao');
  });

  it('colapsa separadores e apara as pontas', () => {
    expect(campaignShortCode('  Perfil Parceiro / Bar  ')).toBe('perfil-parceiro-bar');
  });

  it('origem sem letra nem número ⇒ "link", nunca código vazio', () => {
    expect(campaignShortCode('!!!')).toBe('link');
    expect(campaignShortCode('')).toBe('link');
    // Fallback próprio: não pode virar "restaurante" como o slug do tenant.
    expect(campaignShortCode('居酒屋')).toBe('link');
  });

  it('trunca sem deixar hífen solto no fim', () => {
    const codigo = campaignShortCode('associacao de bares e restaurantes do estado');
    expect(codigo.length).toBeLessThanOrEqual(24);
    expect(codigo.endsWith('-')).toBe(false);
  });

  it('tentativa seguinte muda o código — nunca reaproveita o de outro link', () => {
    expect(campaignShortCode('instagram', 1)).toBe('instagram-2');
    expect(campaignShortCode('instagram', 2)).toBe('instagram-3');
    expect(campaignShortCode('instagram', 1)).not.toBe(campaignShortCode('instagram', 0));
  });

  it('sufixo cabe dentro do limite, encurtando a base se preciso', () => {
    const codigo = campaignShortCode('associacao de bares e restaurantes do estado', 9);
    expect(codigo.length).toBeLessThanOrEqual(24);
    expect(codigo.endsWith('-10')).toBe(true);
  });
});
