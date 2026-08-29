import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApproveRequestSchema, CloseSessionSchema } from '@messa/contracts';
import type { RequestResolution } from '@messa/domain';
import { CurrentPrincipal, Roles } from '../../common/decorators';
import type { StaffPrincipal } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { SessionService } from './session.service';

const actor = (p: StaffPrincipal) => ({ kind: 'staff' as const, id: p.userId });

/** Painel do operador e app do garçom (F03, F08, F12–F14). Permissões em 05-security/auth.md. */
@Controller('staff')
export class StaffSessionController {
  constructor(private readonly sessions: SessionService) {}

  @Get('tables')
  @Roles('operator', 'waiter')
  tables(@CurrentPrincipal() p: StaffPrincipal) {
    return this.sessions.staffTables(p.tenantId!);
  }

  @Post('tables/:id/open')
  @Roles('operator', 'waiter')
  open(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.openByStaff(p.tenantId!, id, actor(p), p.role === 'waiter' ? 'waiter' : 'operator');
  }

  @Get('requests')
  @Roles('operator')
  requests(@CurrentPrincipal() p: StaffPrincipal) {
    return this.sessions.staffRequests(p.tenantId!);
  }

  @Post('requests/:id/approve')
  @Roles('operator')
  @HttpCode(200)
  approve(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ApproveRequestSchema)) body: { resolution?: RequestResolution }) {
    return this.sessions.approve(p.tenantId!, id, body.resolution, actor(p));
  }

  @Post('requests/:id/reject')
  @Roles('operator')
  @HttpCode(200)
  reject(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.reject(p.tenantId!, id, actor(p));
  }

  @Get('sessions/:id')
  @Roles('operator', 'waiter')
  session(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.staffSession(p.tenantId!, id);
  }

  @Post('sessions/:id/close')
  @Roles('operator')
  @HttpCode(200)
  close(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CloseSessionSchema)) body: { force?: boolean }) {
    return this.sessions.close(p.tenantId!, id, Boolean(body.force), actor(p));
  }
}
