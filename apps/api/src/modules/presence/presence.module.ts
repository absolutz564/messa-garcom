import { Global, Module } from '@nestjs/common';
import { CustomerContextService } from './customer-context.service';

@Global()
@Module({ providers: [CustomerContextService], exports: [CustomerContextService] })
export class PresenceModule {}
