import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingJobs } from './billing.jobs';
import { BillingService } from './billing.service';
import { PixProviderFactory } from './pix-provider';

@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingJobs, PixProviderFactory],
  exports: [BillingService],
})
export class BillingModule {}
