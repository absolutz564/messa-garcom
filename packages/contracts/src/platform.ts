import { z } from 'zod';

export const CreateTenantSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'slug inválido'),
  adminEmail: z.string().email(),
  adminName: z.string().min(2).max(80),
  adminPassword: z.string().min(8).max(128),
});
export type CreateTenant = z.infer<typeof CreateTenantSchema>;

export const TenantSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  primaryColor: z.string(),
  status: z.enum(['active', 'blocked']),
  createdAt: z.string(),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const UpdateTenantStatusSchema = z.object({ status: z.enum(['active', 'blocked']) });
