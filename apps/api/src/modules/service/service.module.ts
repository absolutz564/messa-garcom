import { Module } from '@nestjs/common';
import { PublicModule } from '../public/public.module';
import { PublicSessionController } from './public-session.controller';
import { SessionJobs } from './session.jobs';
import { SessionService } from './session.service';
import { StaffSessionController } from './staff-session.controller';

@Module({
  imports: [PublicModule],
  controllers: [PublicSessionController, StaffSessionController],
  providers: [SessionService, SessionJobs],
  exports: [SessionService],
})
export class ServiceModule {}
