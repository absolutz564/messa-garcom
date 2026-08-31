import { z } from 'zod';

export const RoleSchema = z.enum(['admin', 'operator', 'waiter']);
export type Role = z.infer<typeof RoleSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  /** Opcional: quando o usuário tem várias memberships, escolhe o tenant. */
  tenantId: z.string().uuid().optional(),
  /** Obrigatório quando o usuário tem 2FA ativo (platform admin). */
  totpCode: z.string().regex(/^\d{6}$/).optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** BR-21/RF-06 — cadastro self-service. Plano é escolhido depois, em /admin/assinatura. */
export const SignupSchema = z.object({
  restaurantName: z.string().trim().min(2).max(80),
  adminName: z.string().trim().min(2).max(80),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  /** LGPD: sem Termos de Uso ainda (PDR-018), só a Política de Privacidade. */
  acceptedPrivacy: z.literal(true),
});
export type Signup = z.infer<typeof SignupSchema>;

/** BR-22 — recuperação de senha. A resposta nunca revela se o e-mail existe. */
export const ForgotPasswordSchema = z.object({ email: z.string().email().max(254) });
export type ForgotPassword = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(128),
});
export type ResetPassword = z.infer<typeof ResetPasswordSchema>;

export const MembershipSummarySchema = z.object({
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  tenantSlug: z.string(),
  role: RoleSchema,
});
export type MembershipSummary = z.infer<typeof MembershipSummarySchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  user: z.object({ id: z.string().uuid(), name: z.string(), email: z.string() }),
  /** Tenant ativo no access token (null para platform admin sem membership). */
  activeTenant: MembershipSummarySchema.nullable(),
  memberships: z.array(MembershipSummarySchema),
  isPlatformAdmin: z.boolean(),
  /** 2FA ativo e verificado neste login. Platform admin sem 2FA precisa configurá-lo antes de usar /platform. */
  mfa: z.boolean(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const SwitchTenantSchema = z.object({ tenantId: z.string().uuid() });

/** Claims do access token (ADR-004). */
export interface AccessTokenClaims {
  sub: string;
  tenant_id: string | null;
  role: Role | null;
  is_platform_admin: boolean;
  mfa: boolean;
  jti: string;
}

export const TotpSetupResponseSchema = z.object({ secret: z.string(), otpauthUrl: z.string(), qrSvg: z.string() });
export type TotpSetupResponse = z.infer<typeof TotpSetupResponseSchema>;
export const TotpEnableSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
