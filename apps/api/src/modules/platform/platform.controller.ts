import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CreateTenantSchema, UpdateTenantStatusSchema, type CreateTenant } from '@messa/contracts';
import { CurrentPrincipal, PlatformAdmin } from '../../common/decorators';
import type { StaffPrincipal } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { PlatformService } from './platform.service';

@PlatformAdmin()
@Controller('platform/tenants')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  list() {
    return this.platform.list();
  }

  @Post()
  create(@Body(new ZodPipe(CreateTenantSchema)) body: CreateTenant, @CurrentPrincipal() p: StaffPrincipal) {
    return this.platform.create(body, p.userId);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateTenantStatusSchema)) body: { status: 'active' | 'blocked' },
    @CurrentPrincipal() p: StaffPrincipal,
  ) {
    return this.platform.setStatus(id, body.status, p.userId);
  }
}
