import { hashDaSenhaDeAfiliado } from './affiliate-session';

/*
 * O hash argon2 começa com cifrão, e carregador de .env que expande referências
 * a variáveis entrega o valor mutilado — comportando-se de um jeito local e de
 * outro em produção. Base64 atravessa os dois caminhos igual.
 */
describe('hashDaSenhaDeAfiliado (BR-24)', () => {
  const hash = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdGluaG8$aGFzaGRlbWVudGlyaW5oYQ';

  it('aceita o hash cru, para quem colar direto no painel do Fly', () => {
    expect(hashDaSenhaDeAfiliado(hash)).toBe(hash);
    expect(hashDaSenhaDeAfiliado(`  ${hash}  `)).toBe(hash);
  });

  it('aceita o hash em base64', () => {
    expect(hashDaSenhaDeAfiliado(Buffer.from(hash).toString('base64'))).toBe(hash);
  });

  it('sem variável, a área não existe', () => {
    expect(hashDaSenhaDeAfiliado(undefined)).toBeNull();
    expect(hashDaSenhaDeAfiliado('   ')).toBeNull();
  });

  it('valor que não é hash nem base64 de hash é recusado, nunca usado como senha', () => {
    // Se isto devolvesse a string crua, `verify` falharia sempre e o login ficaria
    // quebrado sem dizer por quê — pior que a área simplesmente não existir.
    expect(hashDaSenhaDeAfiliado('senha-em-texto-puro')).toBeNull();
    expect(hashDaSenhaDeAfiliado(Buffer.from('nada a ver').toString('base64'))).toBeNull();
  });
});
