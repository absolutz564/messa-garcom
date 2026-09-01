/**
 * Copia a biblioteca `origem` para dentro deste monorepo, como `@messa/origem`.
 *
 *   node scripts/sync-origem.mjs            # copia e reporta o que mudou
 *   node scripts/sync-origem.mjs --conferir # só verifica se está desatualizada
 *
 * Por que copiar em vez de instalar como dependência: o repositório `origem` não
 * está publicado em nenhum registro, e `file:../origem` não sobrevive ao deploy —
 * o Docker da API recebe apenas os arquivos versionados deste repositório, e a
 * pasta irmã não vai junto. Copiar o **código-fonte** (e não o compilado) deixa a
 * biblioteca sujeita ao mesmo typecheck e ao mesmo empacotamento do resto.
 *
 * O preço é a divergência: alguém edita a cópia, a origem fica para trás, e a
 * correção se perde no próximo sync. Por isso cada arquivo recebe um cabeçalho
 * dizendo onde editar, e `--conferir` existe para rodar antes de publicar.
 *
 * Duas adaptações na cópia:
 * - o sufixo `.js` dos imports é removido: o `origem` compila em NodeNext, que o
 *   exige; os pacotes daqui compilam em CommonJS/Node, onde ele atrapalha;
 * - `adapters/prisma.ts` não é copiado. Este projeto usa Drizzle, e um adaptador
 *   morto só serviria para confundir quem for ler.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const ORIGEM = '../origem/src';
const DESTINO = 'packages/origem/src';
const IGNORAR = ['adapters/prisma.ts'];
const conferir = process.argv.includes('--conferir');

const CABECALHO = `// GERADO por scripts/sync-origem.mjs — não edite aqui.
// A fonte é o repositório "origem", ao lado deste projeto. Edite lá, rode os
// testes de lá, e sincronize com: node scripts/sync-origem.mjs
`;

if (!existsSync(ORIGEM)) {
  console.error(`Não encontrei ${ORIGEM}. O repositório da biblioteca precisa estar ao lado deste.`);
  process.exit(1);
}

function arquivos(dir) {
  const saida = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...arquivos(caminho));
    else if (entrada.name.endsWith('.ts')) saida.push(caminho);
  }
  return saida;
}

const mudados = [];
const copiados = new Set();

for (const origem of arquivos(ORIGEM)) {
  const rel = relative(ORIGEM, origem).replace(/\\/g, '/');
  if (IGNORAR.includes(rel)) continue;

  const conteudo = CABECALHO + readFileSync(origem, 'utf8').replace(/(from\s+"\.[^"]*)\.js"/g, '$1"');
  const destino = join(DESTINO, rel);
  copiados.add(rel);

  const atual = existsSync(destino) ? readFileSync(destino, 'utf8') : null;
  if (atual === conteudo) continue;

  mudados.push(rel);
  if (!conferir) {
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, conteudo);
  }
}

// Arquivo removido da biblioteca não pode continuar vivo aqui.
const obsoletos = existsSync(DESTINO)
  ? arquivos(DESTINO)
      .map((f) => relative(DESTINO, f).replace(/\\/g, '/'))
      .filter((rel) => !copiados.has(rel))
  : [];
for (const rel of obsoletos) {
  mudados.push(`${rel} (removido)`);
  if (!conferir) rmSync(join(DESTINO, rel));
}

if (mudados.length === 0) {
  console.log('origem: em dia.');
  process.exit(0);
}

console.log(`origem: ${mudados.length} arquivo(s) ${conferir ? 'desatualizado(s)' : 'sincronizado(s)'}:`);
for (const m of mudados) console.log(`  ${m}`);
process.exit(conferir ? 1 : 0);
