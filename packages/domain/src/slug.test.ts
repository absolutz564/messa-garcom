import { describe, expect, it } from 'vitest';
import { slugify, slugWithSuffix } from './slug';

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
