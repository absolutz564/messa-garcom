/**
 * Confere se o Dockerfile da API conhece todos os pacotes do monorepo.
 *
 * Existe por causa de um deploy quebrado (2026-08-31): `packages/origem` entrou
 * no workspace, o `pnpm build` da raiz passou (o turbo descobre os pacotes
 * sozinho), o CI ficou verde — e o build da imagem falhou, porque o Dockerfile
 * lista os pacotes à mão em três lugares e ninguém avisa quando some um.
 *
 * Um `docker build` no CI também pegaria, e pegaria mais coisas, mas custa
 * minutos em todo push. Isto custa milissegundos e cobre a falha que de fato
 * aconteceu: pacote novo esquecido.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const DOCKERFILE = 'apps/api/Dockerfile';
const conteudo = readFileSync(DOCKERFILE, 'utf8');

const pacotes = readdirSync('packages', { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(`packages/${e.name}/package.json`))
  .map((e) => e.name);

const problemas = [];
for (const nome of pacotes) {
  const escopo = JSON.parse(readFileSync(`packages/${nome}/package.json`, 'utf8')).name;

  // Os três lugares onde o Dockerfile precisa citar o pacote: o package.json
  // (camada de dependências), o código-fonte e o comando de build.
  if (!conteudo.includes(`COPY packages/${nome}/package.json`)) problemas.push(`${nome}: falta "COPY packages/${nome}/package.json"`);
  if (!new RegExp(`COPY packages/${nome} packages/${nome}\\b`).test(conteudo)) problemas.push(`${nome}: falta "COPY packages/${nome} packages/${nome}"`);
  if (!conteudo.includes(`--filter ${escopo}`)) problemas.push(`${nome}: falta "--filter ${escopo}" no build`);
}

if (problemas.length > 0) {
  console.error(`${DOCKERFILE} está desatualizado em relação a packages/:\n`);
  for (const p of problemas) console.error(`  ${p}`);
  console.error('\nSem isso o CI passa e o deploy quebra na hora de montar a imagem.');
  process.exit(1);
}

console.log(`Dockerfile em dia com os ${pacotes.length} pacotes do workspace.`);
