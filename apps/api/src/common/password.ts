import { hash } from '@node-rs/argon2';

/**
 * Hash de senha (argon2id, ADR-004).
 *
 * Fica aqui, e não em `AuthService`, porque quem cria usuário não é só o módulo de
 * identity: `platform.service` também cria o admin do restaurante. Com o helper
 * dentro de `AuthService`, `platform.service` importava `auth.service` e — depois que
 * o cadastro self-service fez `auth.service` injetar `PlatformService` — os dois
 * arquivos passaram a se importar em ciclo. O ciclo passa no typecheck e no build, mas
 * derruba o processo no boot do Nest ("dependency at index [N] is undefined").
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}
