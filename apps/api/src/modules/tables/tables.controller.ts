import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CreateTableSchema, UpdateTableSchema } from '@messa/contracts';
import type { z } from 'zod';
import { CurrentPrincipal, Roles } from '../../common/decorators';
import type { StaffPrincipal } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { TablesService } from './tables.service';

@Controller('admin/tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  @Roles('operator', 'waiter')
  list(@CurrentPrincipal() p: StaffPrincipal) {
    return this.tables.list(p.tenantId!);
  }

  @Get(':id')
  @Roles('operator', 'waiter')
  get(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.get(p.tenantId!, id);
  }

  @Post()
  @Roles('admin')
  create(@CurrentPrincipal() p: StaffPrincipal, @Body(new ZodPipe(CreateTableSchema)) body: { displayName: string }) {
    return this.tables.create(p.tenantId!, body.displayName, p.userId);
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @CurrentPrincipal() p: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateTableSchema)) body: z.infer<typeof UpdateTableSchema>,
  ) {
    return this.tables.update(p.tenantId!, id, body, p.userId);
  }

  @Post(':id/rotate-token')
  @Roles('admin')
  rotate(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.rotateToken(p.tenantId!, id, p.userId);
  }

  /** Cartaz pronto para imprimir (RF-23/24). */
  @Get('cards.pdf')
  @Roles('admin')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="messa-qrcodes.pdf"')
  @Header('Cache-Control', 'no-store')
  async cardsPdf(@CurrentPrincipal() p: StaffPrincipal) {
    return Buffer.from(await this.tables.cardsPdf(p.tenantId!));
  }

  @Get(':id/card.png')
  @Roles('admin')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'no-store')
  cardPng(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.cardPng(p.tenantId!, id);
  }

  @Get(':id/card.svg')
  @Roles('admin')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'no-store')
  cardSvg(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.cardSvg(p.tenantId!, id);
  }

  @Get(':id/qr.svg')
  @Roles('admin')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Cache-Control', 'no-store')
  qrSvg(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.qrSvg(p.tenantId!, id);
  }

  @Get(':id/qr.png')
  @Roles('admin')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'no-store')
  qrPng(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.tables.qrPng(p.tenantId!, id);
  }
}
