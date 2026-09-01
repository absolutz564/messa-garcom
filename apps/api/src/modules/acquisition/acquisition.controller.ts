import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  AcquisitionQuerySchema,
  AdSpendSchema,
  CreateCampaignLinkSchema,
  type AcquisitionQuery,
  type AdSpend,
  type CreateCampaignLink,
} from '@messa/contracts';
import { PlatformAdmin } from '../../common/decorators';
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
  async links() {
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
  async createLink(@Body(new ZodPipe(CreateCampaignLinkSchema)) body: CreateCampaignLink) {
    const url = new URL(this.config.WEB_PUBLIC_URL);
    url.searchParams.set('utm_source', body.source);
    url.searchParams.set('utm_medium', MEDIUM_POR_CANAL[body.channel]);
    url.searchParams.set('utm_campaign', body.campaign);
    if (body.content) url.searchParams.set('utm_content', body.content);

    const link = { channel: body.channel, source: body.source, campaign: body.campaign, content: body.content ?? null, url: url.toString() };
    await this.acquisition.registrarLink(link);
    return link;
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
