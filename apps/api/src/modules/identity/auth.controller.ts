import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  ForgotPasswordSchema,
  LoginRequestSchema,
  ResetPasswordSchema,
  SignupSchema,
  SwitchTenantSchema,
  TotpEnableSchema,
  type ForgotPassword,
  type LoginRequest,
  type ResetPassword,
  type Signup,
} from '@messa/contracts';
import { CurrentPrincipal, Public } from '../../common/decorators';
import type { StaffPrincipal } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { RateLimit } from '../../common/guards/ip-rate-limit.guard';
import { APP_CONFIG, type AppConfig } from '../../config/config';
import { AuthService, type IssuedTokens } from './auth.service';
import { TotpService } from './totp.service';

export const REFRESH_COOKIE = 'messa_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly totp: TotpService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @RateLimit({ bucket: 'login', limit: 30, windowMs: 15 * 60_000 })
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(LoginRequestSchema)) body: LoginRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const issued = await this.auth.login(body.email, body.password, body.tenantId, body.totpCode);
    this.setRefreshCookie(res, issued);
    return issued.response;
  }

  /** RF-06/BR-21 — cadastro self-service. Rate limit por IP é a única barreira (ADR-007). */
  @Public()
  @RateLimit({ bucket: 'signup', limit: 10, windowMs: 60 * 60_000 })
  @Post('signup')
  @HttpCode(201)
  async signup(@Body(new ZodPipe(SignupSchema)) body: Signup, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const issued = await this.auth.signup(body, req.headers.cookie);
    this.setRefreshCookie(res, issued);
    return issued.response;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    const issued = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
    this.setRefreshCookie(res, issued);
    return issued.response;
  }

  /**
   * BR-22 — pede o link de redefinição. Sempre 204, exista ou não a conta:
   * resposta diferente viraria um verificador de quem tem conta na Messa.
   */
  @Public()
  @RateLimit({ bucket: 'forgot-password', limit: 5, windowMs: 15 * 60_000 })
  @Post('forgot-password')
  @HttpCode(204)
  async forgotPassword(@Body(new ZodPipe(ForgotPasswordSchema)) body: ForgotPassword) {
    await this.auth.requestPasswordReset(body.email);
  }

  /** BR-22 — consome o token e troca a senha (revoga todos os dispositivos). */
  @Public()
  @RateLimit({ bucket: 'reset-password', limit: 10, windowMs: 15 * 60_000 })
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body(new ZodPipe(ResetPasswordSchema)) body: ResetPassword) {
    await this.auth.resetPassword(body.token, body.password);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  }

  @Post('switch-tenant')
  @HttpCode(200)
  async switchTenant(
    @CurrentPrincipal() principal: StaffPrincipal,
    @Body(new ZodPipe(SwitchTenantSchema)) body: { tenantId: string },
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const issued = await this.auth.switchTenant(principal.userId, body.tenantId, req.cookies?.[REFRESH_COOKIE]);
    this.setRefreshCookie(res, issued);
    return issued.response;
  }

  /** 2FA: gera segredo + QR (usuário autenticado, ainda sem 2FA). */
  @Post('2fa/setup')
  @HttpCode(200)
  setupTotp(@CurrentPrincipal() principal: StaffPrincipal) {
    return this.totp.setup(principal.userId);
  }

  /** 2FA: confirma o código e reemite tokens com `mfa: true`. */
  @Post('2fa/enable')
  @HttpCode(200)
  async enableTotp(@CurrentPrincipal() principal: StaffPrincipal, @Body(new ZodPipe(TotpEnableSchema)) body: { code: string }, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    await this.totp.enable(principal.userId, body.code);
    const issued = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
    this.setRefreshCookie(res, issued);
    return issued.response;
  }

  @Get('me')
  me(@CurrentPrincipal() principal: StaffPrincipal) {
    return principal;
  }

  private setRefreshCookie(res: FastifyReply, issued: IssuedTokens) {
    res.setCookie(REFRESH_COOKIE, issued.refreshCookie, {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      expires: issued.refreshExpiresAt,
    });
  }
}
