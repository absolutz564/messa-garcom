import { describe, expect, it } from 'vitest';
import { attributionCookieDomain } from './attribution';

describe('attributionCookieDomain (BR-23)', () => {
  it('produção: API em subdomínio ⇒ cookie no domínio pai', () => {
    // O bug que esta função corrige: sem Domain, o cookie gravado em
    // messa-garcom.com.br não acompanha o cadastro para api.messa-garcom.com.br,
    // e a campanha que trouxe o restaurante some.
    expect(attributionCookieDomain('messa-garcom.com.br', 'api.messa-garcom.com.br')).toBe('messa-garcom.com.br');
  });

  it('desenvolvimento: mesmo host em portas diferentes ⇒ host-only', () => {
    // Cookie ignora porta. Aqui já funcionava, e é por isso que o bug passou.
    expect(attributionCookieDomain('localhost', 'localhost')).toBeUndefined();
  });

  it('porta no host não atrapalha a comparação', () => {
    expect(attributionCookieDomain('localhost:3000', 'localhost:3001')).toBeUndefined();
  });

  it('maiúsculas e ponto final do FQDN não impedem a correspondência', () => {
    expect(attributionCookieDomain('Messa-Garcom.com.br.', 'API.messa-garcom.com.br')).toBe('messa-garcom.com.br');
  });

  it('ramos irmãos ⇒ host-only, nunca um palpite de domínio pai', () => {
    // Subir ao pai comum exigiria a Public Suffix List; um palpite errado faz o
    // navegador descartar o cookie inteiro, em silêncio.
    expect(attributionCookieDomain('www.messa-garcom.com.br', 'api.messa-garcom.com.br')).toBeUndefined();
  });

  it('hosts sem parentesco (preview) ⇒ host-only', () => {
    expect(attributionCookieDomain('messa-web-abc123.vercel.app', 'api.messa-garcom.com.br')).toBeUndefined();
  });

  it('sufixo parecido não é parentesco', () => {
    // "naomessa-garcom.com.br" termina com "messa-garcom.com.br" por acidente de
    // string; entregar o cookie a ele seria entregar a terceiro.
    expect(attributionCookieDomain('messa-garcom.com.br', 'apinaomessa-garcom.com.br')).toBeUndefined();
  });

  it('host vazio não vira domínio', () => {
    expect(attributionCookieDomain('', 'api.messa-garcom.com.br')).toBeUndefined();
    expect(attributionCookieDomain('messa-garcom.com.br', '')).toBeUndefined();
  });
});
