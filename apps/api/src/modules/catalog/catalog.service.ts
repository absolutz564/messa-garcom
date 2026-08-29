import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema, type DbHandle, type Tx } from '@messa/db';
import type {
  Category,
  Menu,
  MenuProduct,
  Product,
  ServiceArea,
  UpsertCategory,
  UpsertProduct,
} from '@messa/contracts';
import { DB } from '../db/db.module';
import { OutboxService } from '../events/outbox.service';

type Actor = { kind: 'staff'; id: string };

/** Catálogo: áreas de serviço, categorias, produtos (RF-11..16). */
@Injectable()
export class CatalogService {
  constructor(
    @Inject(DB) private readonly db: DbHandle,
    private readonly outbox: OutboxService,
  ) {}

  // ---------------- áreas de serviço ----------------

  listAreas(tenantId: string): Promise<ServiceArea[]> {
    return this.db.withTenantTx(tenantId, async (tx) => (await this.areasIn(tx, tenantId)).map(areaDto));
  }

  /** BR-12: fechamento é imediato para novos pedidos. */
  setAreaOpen(tenantId: string, key: string, isOpen: boolean, actor: Actor): Promise<ServiceArea> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [area] = await tx
        .update(schema.serviceAreas)
        .set({ isOpen, changedAt: new Date(), changedByUserId: actor.id })
        .where(and(eq(schema.serviceAreas.tenantId, tenantId), eq(schema.serviceAreas.key, key)))
        .returning();
      if (!area) throw new NotFoundException({ code: 'not_found' });
      await this.outbox.append(tx, {
        tenantId,
        type: 'service_area.changed',
        aggregateType: 'service_area',
        aggregateId: area.id,
        actor,
        payload: { key: area.key, isOpen },
      });
      return areaDto(area);
    });
  }

  // ---------------- categorias ----------------

  listCategories(tenantId: string): Promise<Category[]> {
    return this.db.withTenantTx(tenantId, async (tx) =>
      (
        await tx
          .select()
          .from(schema.categories)
          .where(eq(schema.categories.tenantId, tenantId))
          .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name))
      ).map(categoryDto),
    );
  }

  createCategory(tenantId: string, input: UpsertCategory, actor: Actor): Promise<Category> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [row] = await tx
        .insert(schema.categories)
        .values({ tenantId, name: input.name, sortOrder: input.sortOrder ?? 0, isActive: input.isActive ?? true })
        .returning();
      await this.catalogChanged(tx, tenantId, actor);
      return categoryDto(row!);
    });
  }

  updateCategory(tenantId: string, id: string, input: Partial<UpsertCategory>, actor: Actor): Promise<Category> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [row] = await tx
        .update(schema.categories)
        .set(stripUndefined({ name: input.name, sortOrder: input.sortOrder, isActive: input.isActive }))
        .where(and(eq(schema.categories.tenantId, tenantId), eq(schema.categories.id, id)))
        .returning();
      if (!row) throw new NotFoundException({ code: 'not_found' });
      await this.catalogChanged(tx, tenantId, actor);
      return categoryDto(row);
    });
  }

  deleteCategory(tenantId: string, id: string, actor: Actor): Promise<void> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [inUse] = await tx
        .select({ id: schema.products.id })
        .from(schema.products)
        .where(and(eq(schema.products.tenantId, tenantId), eq(schema.products.categoryId, id), isNull(schema.products.deletedAt)))
        .limit(1);
      if (inUse) throw new ConflictException({ code: 'category_in_use', message: 'Categoria possui produtos' });
      const deleted = await tx
        .delete(schema.categories)
        .where(and(eq(schema.categories.tenantId, tenantId), eq(schema.categories.id, id)))
        .returning({ id: schema.categories.id });
      if (deleted.length === 0) throw new NotFoundException({ code: 'not_found' });
      await this.catalogChanged(tx, tenantId, actor);
    });
  }

  // ---------------- produtos ----------------

  listProducts(tenantId: string): Promise<Product[]> {
    return this.db.withTenantTx(tenantId, async (tx) => this.productsIn(tx, tenantId));
  }

  createProduct(tenantId: string, input: UpsertProduct, actor: Actor): Promise<Product> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      await this.assertRefs(tx, tenantId, input.categoryId, input.serviceAreaId);
      const [row] = await tx
        .insert(schema.products)
        .values({
          tenantId,
          categoryId: input.categoryId,
          serviceAreaId: input.serviceAreaId,
          name: input.name,
          description: input.description ?? null,
          priceCents: input.priceCents,
          imageUrl: input.imageUrl ?? null,
          isAvailable: input.isAvailable ?? true,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      await this.catalogChanged(tx, tenantId, actor);
      return (await this.productsIn(tx, tenantId, row!.id))[0]!;
    });
  }

  updateProduct(tenantId: string, id: string, input: Partial<UpsertProduct>, actor: Actor): Promise<Product> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      if (input.categoryId || input.serviceAreaId) {
        const [current] = await tx
          .select({ categoryId: schema.products.categoryId, serviceAreaId: schema.products.serviceAreaId })
          .from(schema.products)
          .where(and(eq(schema.products.tenantId, tenantId), eq(schema.products.id, id)));
        if (!current) throw new NotFoundException({ code: 'not_found' });
        await this.assertRefs(tx, tenantId, input.categoryId ?? current.categoryId, input.serviceAreaId ?? current.serviceAreaId);
      }
      const [row] = await tx
        .update(schema.products)
        .set({
          ...stripUndefined({
            categoryId: input.categoryId,
            serviceAreaId: input.serviceAreaId,
            name: input.name,
            description: input.description,
            priceCents: input.priceCents,
            imageUrl: input.imageUrl,
            isAvailable: input.isAvailable,
            sortOrder: input.sortOrder,
          }),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.products.tenantId, tenantId), eq(schema.products.id, id), isNull(schema.products.deletedAt)))
        .returning({ id: schema.products.id });
      if (!row) throw new NotFoundException({ code: 'not_found' });
      await this.catalogChanged(tx, tenantId, actor);
      return (await this.productsIn(tx, tenantId, id))[0]!;
    });
  }

  /** Soft delete: pedidos antigos continuam referenciando o produto (BR-15). */
  deleteProduct(tenantId: string, id: string, actor: Actor): Promise<void> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const rows = await tx
        .update(schema.products)
        .set({ deletedAt: new Date(), isAvailable: false })
        .where(and(eq(schema.products.tenantId, tenantId), eq(schema.products.id, id), isNull(schema.products.deletedAt)))
        .returning({ id: schema.products.id });
      if (rows.length === 0) throw new NotFoundException({ code: 'not_found' });
      await this.catalogChanged(tx, tenantId, actor);
    });
  }

  // ---------------- cardápio público ----------------

  /** Menu com estado derivado por produto (PDR-007: indisponíveis visíveis com rótulo). */
  async menu(tx: Tx, tenantId: string): Promise<Menu> {
    const areas = await this.areasIn(tx, tenantId);
    const areaByKeyId = new Map(areas.map((a) => [a.id, a]));
    const categories = await tx
      .select()
      .from(schema.categories)
      .where(and(eq(schema.categories.tenantId, tenantId), eq(schema.categories.isActive, true)))
      .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
    const products = await tx
      .select()
      .from(schema.products)
      .where(and(eq(schema.products.tenantId, tenantId), isNull(schema.products.deletedAt)))
      .orderBy(asc(schema.products.sortOrder), asc(schema.products.name));

    const byCategory = new Map<string, MenuProduct[]>();
    for (const p of products) {
      const area = areaByKeyId.get(p.serviceAreaId)!;
      const state: MenuProduct['state'] = !area.isOpen ? 'area_closed' : !p.isAvailable ? 'unavailable' : 'orderable';
      const list = byCategory.get(p.categoryId) ?? [];
      list.push({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        imageUrl: p.imageUrl,
        state,
        serviceAreaKey: area.key as MenuProduct['serviceAreaKey'],
      });
      byCategory.set(p.categoryId, list);
    }
    return {
      categories: categories
        .map((c) => ({ id: c.id, name: c.name, products: byCategory.get(c.id) ?? [] }))
        .filter((c) => c.products.length > 0),
      serviceAreas: areas.map((a) => ({ key: a.key as 'kitchen' | 'bar', name: a.name, isOpen: a.isOpen })),
    };
  }

  // ---------------- helpers ----------------

  private areasIn(tx: Tx, tenantId: string) {
    return tx.select().from(schema.serviceAreas).where(eq(schema.serviceAreas.tenantId, tenantId)).orderBy(asc(schema.serviceAreas.key));
  }

  private async productsIn(tx: Tx, tenantId: string, id?: string): Promise<Product[]> {
    const rows = await tx
      .select({ p: schema.products, areaKey: schema.serviceAreas.key })
      .from(schema.products)
      .innerJoin(schema.serviceAreas, eq(schema.serviceAreas.id, schema.products.serviceAreaId))
      .where(
        and(
          eq(schema.products.tenantId, tenantId),
          isNull(schema.products.deletedAt),
          id ? eq(schema.products.id, id) : undefined,
        ),
      )
      .orderBy(asc(schema.products.sortOrder), asc(schema.products.name));
    return rows.map(({ p, areaKey }) => ({
      id: p.id,
      categoryId: p.categoryId,
      serviceAreaId: p.serviceAreaId,
      serviceAreaKey: areaKey as Product['serviceAreaKey'],
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      imageUrl: p.imageUrl,
      isAvailable: p.isAvailable,
      sortOrder: p.sortOrder,
    }));
  }

  private async assertRefs(tx: Tx, tenantId: string, categoryId: string, serviceAreaId: string) {
    const [cat] = await tx
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(and(eq(schema.categories.tenantId, tenantId), eq(schema.categories.id, categoryId)));
    if (!cat) throw new NotFoundException({ code: 'not_found', message: 'Categoria não encontrada' });
    const [area] = await tx
      .select({ id: schema.serviceAreas.id })
      .from(schema.serviceAreas)
      .where(and(eq(schema.serviceAreas.tenantId, tenantId), eq(schema.serviceAreas.id, serviceAreaId)));
    if (!area) throw new NotFoundException({ code: 'not_found', message: 'Área de serviço não encontrada' });
  }

  private catalogChanged(tx: Tx, tenantId: string, actor: Actor) {
    return this.outbox.append(tx, { tenantId, type: 'catalog.changed', aggregateType: 'catalog', aggregateId: tenantId, actor });
  }
}

function areaDto(a: typeof schema.serviceAreas.$inferSelect): ServiceArea {
  return { id: a.id, key: a.key as ServiceArea['key'], name: a.name, isOpen: a.isOpen, changedAt: a.changedAt?.toISOString() ?? null };
}
function categoryDto(c: typeof schema.categories.$inferSelect): Category {
  return { id: c.id, name: c.name, sortOrder: c.sortOrder, isActive: c.isActive };
}
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
