import { Body, Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  AcquisitionQuerySchema,
  AdSpendSchema,
  CreateCampaignLinkSchema,
  type AcquisitionQuery,
  type AdSpend,
  type CampaignLinkDto,
  type CreateCampaignLink,
  type ShortLinkTarget,
} from '@messa/contracts';
import { Public, PlatformAdmin } from '../../common/decorators';
import { RateLimit } from '../../common/guards/ip-rate-limit.guard';
import { ZodPipe } from '../../common/zod.pipe';
import { APP_CONFIG, type AppConfig } from '../../config/config';
import { Inject } from '@nestjs/common';
import { AcquisitionService } from './acquisition.service';

/** Aquisição (RF-07/BR-23). Só o Super Admin: é a conta da plataforma, não do restaurante. */
@PlatformAdmin()
@Controller('platform/acquisition')
export class AcquisitionController {
  constructor(
    private readonly acquisition: AcquisitionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('report')
  report(@Query(new ZodPipe(AcquisitionQuerySchema)) query: AcquisitionQuery) {
    return this.acquisition.relatorio({ modelo: query.modelo, agruparPor: query.agruparPor });
  }

  @Post('spend')
  @HttpCode(201)
  async spend(@Body(new ZodPipe(AdSpendSchema)) body: AdSpend) {
    await this.acquisition.lancarGasto({
      channel: body.channel,
      source: body.source,
      campaign: body.campaign ?? null,
      content: body.content ?? null,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      amount: body.amount,
      note: body.note ?? null,
    });
  }

  @Get('links')
  async links(): Promise<CampaignLinkDto[]> {
    const links = await this.acquisition.listarLinks();
    return links.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }));
  }

  /**
   * Monta o link com as marcações e o guarda.
   *
   * Guardar não é conveniência de interface: é o que impede o erro de digitação
   * que quebra o relatório. Entre criar o anúncio e lançar o gasto passam
   * semanas, e sem uma lista para escolher o nome da campanha é digitado de
   * memória — separando a verba dos clientes que ela trouxe.
   */
  @Post('links')
  @HttpCode(201)
  async createLink(@Body(new ZodPipe(CreateCampaignLinkSchema)) body: CreateCampaignLink): Promise<CampaignLinkDto> {
    const url = new URL(this.config.WEB_PUBLIC_URL);
    url.searchParams.set('utm_source', body.source);
    url.searchParams.set('utm_medium', MEDIUM_POR_CANAL[body.channel]);
    url.searchParams.set('utm_campaign', body.campaign);
    if (body.content) url.searchParams.set('utm_content', body.content);

    const salvo = await this.acquisition.registrarLink({
      channel: body.channel,
      source: body.source,
      campaign: body.campaign,
      content: body.content ?? null,
      url: url.toString(),
    });
    return { ...salvo, createdAt: salvo.createdAt.toISOString() };
  }
}

/**
 * Resolve o código curto de `/i/<slug>` (BR-23).
 *
 * Pública porque quem chama é a rota do site antes de qualquer sessão existir —
 * a pessoa acabou de clicar num anúncio. Não expõe nada: devolve só a URL de
 * destino, que é a mesma que a pessoa veria na barra de endereço um instante
 * depois. Código desconhecido devolve `null`, e não 404, porque quem decide o
 * que fazer com isso é o site (ele leva à landing — erro de digitação no
 * anúncio custa a atribuição, não deve custar também a visita).
 */
@Public()
@RateLimit({ bucket: 'public', limit: 120, windowMs: 60_000 })
@Controller('public/links')
export class ShortLinkController {
  constructor(private readonly acquisition: AcquisitionService) {}

  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  async resolve(@Param('slug') slug: string): Promise<ShortLinkTarget> {
    // Corta antes de ir ao banco: o código nasce de `campaignShortCode`, que
    // nunca passa de 24 caracteres. Qualquer coisa maior é varredura.
    if (!slug || slug.length > 64) return { url: null };
    return { url: await this.acquisition.destinoDoCodigo(slug) };
  }
}

/** `utm_medium` coerente com o canal, para a classificação de volta bater com a intenção. */
const MEDIUM_POR_CANAL: Record<CreateCampaignLink['channel'], string> = {
  paid_search: 'cpc',
  paid_social: 'paid_social',
  organic_search: 'organic',
  organic_social: 'social',
  referral: 'referral',
  email: 'email',
  direct: 'none',
  other: 'other',
};
