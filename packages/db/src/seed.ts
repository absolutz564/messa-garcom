/**
 * Seed de desenvolvimento: 1 platform admin, 1 tenant demo com admin/operador/garçom,
 * áreas de serviço, categorias, produtos e mesas.
 * Idempotente: roda várias vezes sem duplicar.
 */
import { loadEnv } from './env';
loadEnv();
import { hash } from '@node-rs/argon2';
import { eq, and } from 'drizzle-orm';
import { generatePublicToken } from '@messa/domain';
import { createDb } from './client';
import * as s from './schema';

const PASSWORD = 'messa123';

async function main() {
  const url = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definido');
  const handle = createDb(url, { max: 1 });
  const passwordHash = await hash(PASSWORD);

  await handle.withPlatformTx(async (tx) => {
    // --- users (globais) ---
    const upsertUser = async (email: string, name: string, isPlatformAdmin = false) => {
      const [existing] = await tx.select().from(s.users).where(eq(s.users.email, email));
      if (existing) return existing;
      const [created] = await tx
        .insert(s.users)
        .values({ email, name, passwordHash, isPlatformAdmin })
        .returning();
      return created!;
    };

    await upsertUser('platform@messa.local', 'Platform Admin', true);
    const admin = await upsertUser('admin@bardojoao.local', 'João (Admin)');
    const operator = await upsertUser('caixa@bardojoao.local', 'Maria (Caixa)');
    const waiter = await upsertUser('garcom@bardojoao.local', 'Pedro (Garçom)');

    // --- tenant ---
    let [tenant] = await tx.select().from(s.tenants).where(eq(s.tenants.slug, 'bar-do-joao'));
    if (!tenant) {
      [tenant] = await tx
        .insert(s.tenants)
        .values({ slug: 'bar-do-joao', name: 'Bar do João', primaryColor: '#f59e0b' })
        .returning();
    }
    const tenantId = tenant!.id;

    // --- memberships ---
    const upsertMembership = async (userId: string, role: 'admin' | 'operator' | 'waiter') => {
      const [existing] = await tx
        .select()
        .from(s.memberships)
        .where(and(eq(s.memberships.tenantId, tenantId), eq(s.memberships.userId, userId)));
      if (existing) return;
      await tx.insert(s.memberships).values({
        tenantId,
        userId,
        role,
        status: 'active',
        acceptedAt: new Date(),
      });
    };
    await upsertMembership(admin.id, 'admin');
    await upsertMembership(operator.id, 'operator');
    await upsertMembership(waiter.id, 'waiter');

    // --- service areas ---
    const areaIds: Record<string, string> = {};
    for (const [key, name] of [
      ['kitchen', 'Cozinha'],
      ['bar', 'Bar'],
    ] as const) {
      let [area] = await tx
        .select()
        .from(s.serviceAreas)
        .where(and(eq(s.serviceAreas.tenantId, tenantId), eq(s.serviceAreas.key, key)));
      if (!area) {
        [area] = await tx.insert(s.serviceAreas).values({ tenantId, key, name }).returning();
      }
      areaIds[key] = area!.id;
    }

    // --- categorias e produtos ---
    const catalog: Array<{
      category: string;
      area: 'kitchen' | 'bar';
      items: Array<[string, number, string?]>;
    }> = [
      {
        category: 'Hambúrgueres',
        area: 'kitchen',
        items: [
          [
            'Lombali Burger',
            3490,
            'Hambúrguer artesanal de 180g, queijo cheddar, bacon crocante, cebola caramelizada e molho especial da casa. Acompanha batata frita.',
          ],
          ['X-Bacon', 2990],
          ['X-Salada', 2790],
        ],
      },
      {
        category: 'Porções',
        area: 'kitchen',
        items: [['Batata Frita Grande', 3290, 'Porção aproximada de 500g, ideal para compartilhar.']],
      },
      {
        category: 'Bebidas',
        area: 'bar',
        items: [
          ['Cerveja Long Neck', 990],
          ['Refrigerante Lata', 690],
          ['Água Mineral', 490],
        ],
      },
    ];

    let catOrder = 0;
    for (const group of catalog) {
      let [cat] = await tx
        .select()
        .from(s.categories)
        .where(and(eq(s.categories.tenantId, tenantId), eq(s.categories.name, group.category)));
      if (!cat) {
        [cat] = await tx
          .insert(s.categories)
          .values({ tenantId, name: group.category, sortOrder: catOrder })
          .returning();
      }
      catOrder++;
      let prodOrder = 0;
      for (const [name, priceCents, description] of group.items) {
        const [existing] = await tx
          .select()
          .from(s.products)
          .where(and(eq(s.products.tenantId, tenantId), eq(s.products.name, name)));
        if (!existing) {
          await tx.insert(s.products).values({
            tenantId,
            categoryId: cat!.id,
            serviceAreaId: areaIds[group.area]!,
            name,
            description: description ?? null,
            priceCents,
            sortOrder: prodOrder,
          });
        }
        prodOrder++;
      }
    }

    // --- mesas ---
    const tableNames = ['Mesa 01', 'Mesa 02', 'Mesa 38', 'VIP 01', 'Varanda 03', 'Bar 05'];
    let order = 0;
    for (const displayName of tableNames) {
      const [existing] = await tx
        .select()
        .from(s.tables)
        .where(and(eq(s.tables.tenantId, tenantId), eq(s.tables.displayName, displayName)));
      if (!existing) {
        await tx.insert(s.tables).values({
          tenantId,
          displayName,
          publicToken: generatePublicToken(),
          sortOrder: order,
        });
      }
      order++;
    }
  });

  await handle.close();
  console.log(`seed ok — senha de todos os usuários: ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
