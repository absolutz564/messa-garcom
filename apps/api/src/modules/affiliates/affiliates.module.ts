import { Module } from '@nestjs/common';
import { AffiliatesController } from './affiliates.controller';
import { AffiliatesService } from './affiliates.service';

/** RF-08/BR-24 — acompanhamento somente-leitura para quem divulga. */
@Module({ controllers: [AffiliatesController], providers: [AffiliatesService] })
export class AffiliatesModule {}
