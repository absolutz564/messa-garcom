import { z } from 'zod';

export const ServiceAreaKeySchema = z.enum(['kitchen', 'bar']);

export const ServiceAreaSchema = z.object({
  id: z.string().uuid(),
  key: ServiceAreaKeySchema,
  name: z.string(),
  isOpen: z.boolean(),
  changedAt: z.string().nullable(),
});
export type ServiceArea = z.infer<typeof ServiceAreaSchema>;

export const SetServiceAreaOpenSchema = z.object({ isOpen: z.boolean() });

export const CategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type Category = z.infer<typeof CategorySchema>;

export const UpsertCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpsertCategory = z.infer<typeof UpsertCategorySchema>;

export const ProductSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  serviceAreaId: z.string().uuid(),
  serviceAreaKey: ServiceAreaKeySchema,
  name: z.string(),
  /** Opcional (§18): ingredientes, peso, acompanhamentos… */
  description: z.string().nullable(),
  priceCents: z.number().int(),
  imageUrl: z.string().nullable(),
  isAvailable: z.boolean(),
  sortOrder: z.number().int(),
});
export type Product = z.infer<typeof ProductSchema>;

export const UpsertProductSchema = z.object({
  categoryId: z.string().uuid(),
  serviceAreaId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  priceCents: z.number().int().min(0).max(100_000_00),
  imageUrl: z.string().url().nullable().optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpsertProduct = z.infer<typeof UpsertProductSchema>;

export const PatchProductSchema = UpsertProductSchema.partial();

/** Cardápio público (RF-14). Estado derivado por produto (state-machines.md). */
export const MenuProductSchema = ProductSchema.pick({
  id: true,
  name: true,
  description: true,
  priceCents: true,
  imageUrl: true,
}).extend({
  state: z.enum(['orderable', 'unavailable', 'area_closed']),
  serviceAreaKey: ServiceAreaKeySchema,
});
export type MenuProduct = z.infer<typeof MenuProductSchema>;

export const MenuCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  products: z.array(MenuProductSchema),
});

export const MenuSchema = z.object({
  categories: z.array(MenuCategorySchema),
  serviceAreas: z.array(ServiceAreaSchema.pick({ key: true, name: true, isOpen: true })),
});
export type Menu = z.infer<typeof MenuSchema>;
