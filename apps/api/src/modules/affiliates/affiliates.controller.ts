import { Body, Controller, Get, Header, HttpCode, Inject, NotFoundException, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verify } from '@node-rs/argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AffiliateLoginSchema, type AffiliateBlock, type AffiliateLogin } from '@messa/contracts';
import { Public } from '../../common/decorators';
import { RateLimit } from '../../common/guards/ip-rate-limit.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { APP_CONFIG, type AppConfig } from '../../config/config';
import { AffiliatesService } from './affiliates.service';
import {
  AFILIADO_COOKIE,
  AFILIADO_ISSUER,
  AFILIADO_TTL_SEGUNDOS,
  AFILIADO_USUARIO,
  hashDaSenhaDeAfiliado,
  type TokenDeAfiliado,
} from './affiliate-session';

/**
 * Área de afiliados (RF-08/BR-24). Somente leitura, autenticação própria.
 *
 * `@Public()` desliga o guard de staff; a autorização é o cookie desta área, e
 * nunca um token de staff. Todas as rotas respondem **404 sem sessão**, e não
 * 401: quem não conhece a credencial não recebe confirmação de que existe uma
 * área aqui para ser arrombada.
 */
@Public()
@Controller('afiliados')
export class AffiliatesController {
  constructor(
    private readonly affiliates: AffiliatesService,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Entrada com a credencial única.
   *
   * Limite por IP com a mesma folga do login de staff: é uma senha só,
   * compartilhada por várias pessoas e trocada por mensagem — força bruta é o
   * ataque mais plausível que este endereço vai receber.
   */
  @RateLimit({ bucket: 'afiliado_login', limit: 20, windowMs: 15 * 60_000 })
  @Post('entrar')
  @HttpCode(200)
  async entrar(@Body(new ZodPipe(AffiliateLoginSchema)) body: AffiliateLogin, @Res({ passthrough: true }) res: FastifyReply) {
    const hash = this.hashConfigurado();

    const usuarioConfere = body.usuario.toLowerCase() === AFILIADO_USUARIO;
    const senhaConfere = await verify(hash, body.senha).catch(() => false);
    // Uma mensagem só para os dois casos: dizer qual dos campos errou entrega
    // metade da credencial a quem está tentando adivinhar.
    if (!usuarioConfere || !senhaConfere) {
      throw new UnauthorizedException({ code: 'invalid_credentials', message: 'Usuário ou senha incorretos.' });
    }

    const token = await this.jwt.signAsync({ purpose: 'afiliado' } satisfies TokenDeAfiliado, {
      issuer: AFILIADO_ISSUER,
      expiresIn: AFILIADO_TTL_SEGUNDOS,
    });
    res.setCookie(AFILIADO_COOKIE, token, {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/afiliados',
      maxAge: AFILIADO_TTL_SEGUNDOS,
    });
    return { ok: true };
  }

  @Get('painel')
  @Header('Cache-Control', 'no-store')
  async painel(@Req() req: FastifyRequest): Promise<AffiliateBlock[]> {
    this.hashConfigurado();
    if (!(await this.temSessao(req))) throw new NotFoundException({ code: 'not_found', message: 'Página não encontrada.' });
    return this.affiliates.painel();
  }

  @Post('sair')
  @HttpCode(204)
  sair(@Res({ passthrough: true }) res: FastifyReply): void {
    res.clearCookie(AFILIADO_COOKIE, { path: '/afiliados' });
  }

  /** Sem hash configurado a área inteira não existe (404, nunca "senha incorreta"). */
  private hashConfigurado(): string {
    const hash = hashDaSenhaDeAfiliado(this.config.AFILIADOS_SENHA_HASH);
    if (!hash) throw new NotFoundException({ code: 'not_found', message: 'Página não encontrada.' });
    return hash;
  }

  /**
   * O `issuer` é a separação de verdade: o `JwtModule` verifica `issuer: 'messa'`,
   * então token de staff é recusado aqui e token de afiliado é recusado lá — pela
   * própria biblioteca, não por um `if` que alguém pode remover sem perceber.
   */
  private async temSessao(req: FastifyRequest): Promise<boolean> {
    const token = req.cookies?.[AFILIADO_COOKIE];
    if (!token) return false;
    try {
      const claims = await this.jwt.verifyAsync<Partial<TokenDeAfiliado>>(token, { issuer: AFILIADO_ISSUER });
      return claims.purpose === 'afiliado';
    } catch {
      return false;
    }
  }
}
