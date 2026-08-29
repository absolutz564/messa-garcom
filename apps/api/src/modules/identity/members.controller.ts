import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AcceptInviteSchema, InviteMemberSchema, UpdateMemberSchema, type InviteMember } from '@messa/contracts';
import type { z } from 'zod';
import { CurrentPrincipal, Public, Roles } from '../../common/decorators';
import type { StaffPrincipal } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { RateLimit } from '../../common/guards/ip-rate-limit.guard';
import { MembersService } from './members.service';

@Controller()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('admin/members')
  @Roles('admin')
  list(@CurrentPrincipal() p: StaffPrincipal) {
    return this.members.list(p.tenantId!);
  }

  @Post('admin/members/invite')
  @Roles('admin')
  invite(@CurrentPrincipal() p: StaffPrincipal, @Body(new ZodPipe(InviteMemberSchema)) body: InviteMember) {
    return this.members.invite(p.tenantId!, body, p.userId);
  }

  @Patch('admin/members/:id')
  @Roles('admin')
  update(
    @CurrentPrincipal() p: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateMemberSchema)) body: z.infer<typeof UpdateMemberSchema>,
  ) {
    return this.members.update(p.tenantId!, id, body, p.userId);
  }

  @Post('admin/members/:id/revoke-devices')
  @Roles('admin')
  revoke(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.members.revokeDevices(p.tenantId!, id);
  }

  @Public()
  @RateLimit({ bucket: 'accept_invite', limit: 10, windowMs: 15 * 60_000 })
  @Post('auth/accept-invite')
  @HttpCode(200)
  accept(@Body(new ZodPipe(AcceptInviteSchema)) body: { token: string; password: string }) {
    return this.members.acceptInvite(body.token, body.password);
  }
}
