import { z } from 'zod';

/** Branding visível ao cliente (RF-10/14). */
export const TenantBrandingSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  primaryColor: z.string(),
});
export type TenantBranding = z.infer<typeof TenantBrandingSchema>;

export const UpdateTenantBrandingSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'cor em hex #RRGGBB')
    .optional(),
});
export type UpdateTenantBranding = z.infer<typeof UpdateTenantBrandingSchema>;

export const TableSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  publicToken: z.string(),
  qrUrl: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type Table = z.infer<typeof TableSchema>;

export const CreateTableSchema = z.object({ displayName: z.string().trim().min(1).max(40) });
export const UpdateTableSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const MemberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['admin', 'operator', 'waiter']),
  status: z.enum(['invited', 'active', 'disabled']),
});
export type Member = z.infer<typeof MemberSchema>;

export const InviteMemberSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().min(2).max(80),
  role: z.enum(['admin', 'operator', 'waiter']),
});
export type InviteMember = z.infer<typeof InviteMemberSchema>;

export const AcceptInviteSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(128),
});

export const UpdateMemberSchema = z.object({
  role: z.enum(['admin', 'operator', 'waiter']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

/** Resposta de GET /public/tables/{token} (F01). */
export const PublicTableSchema = z.object({
  tenant: TenantBrandingSchema,
  table: z.object({ id: z.string().uuid(), displayName: z.string() }),
  state: z.enum(['free', 'requested', 'occupied', 'inactive']),
});
export type PublicTable = z.infer<typeof PublicTableSchema>;
